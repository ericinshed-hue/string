import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'node_modules', 'vditor', 'dist')
const destRoot = join(root, 'src', 'renderer', 'public', 'vditor')
const to = join(destRoot, 'dist')

if (!existsSync(from)) {
  console.warn('vditor dist not found, skip copy')
  process.exit(0)
}

rmSync(destRoot, { recursive: true, force: true })
mkdirSync(to, { recursive: true })
cpSync(from, to, { recursive: true })
console.log('copied vditor assets')
