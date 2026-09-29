import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const publish = process.argv.includes('--publish')
const output = join(process.env.LOCALAPPDATA || process.cwd(), 'string-build')

function gh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8' })
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || '').trim()
    throw new Error(message || `gh ${args.join(' ')} failed`)
  }
  return result.stdout.trim()
}

const args = ['electron-builder', '--win', 'nsis', `--config.directories.output=${output}`]
const env = {
  ...process.env,
  CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR:
    process.env.ELECTRON_BUILDER_BINARIES_MIRROR || 'https://npmmirror.com/mirrors/electron-builder-binaries/'
}
args.push(`--config.electronDist=${join(process.cwd(), 'node_modules', 'electron', 'dist')}`)

if (publish) {
  try {
    gh(['auth', 'status'])
  } catch {
    console.error('GitHub is not signed in. Run: gh auth login')
    process.exit(1)
  }
  const owner = gh(['api', 'user', '--jq', '.login'])
  env.GH_TOKEN = gh(['auth', 'token'])
  args.push(
    '--publish',
    'always',
    '--config.publish.provider=github',
    `--config.publish.owner=${owner}`,
    '--config.publish.repo=string'
  )
}

const result = spawnSync('npx', args, { stdio: 'inherit', shell: true, env })
if (result.status !== 0) process.exit(result.status ?? 1)
if (!publish) console.log(output)
