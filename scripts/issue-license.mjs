import { createPrivateKey, sign } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const keyPath = join(root, 'secrets', 'license-private.pem')

function arg(name) {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0) return ''
  return process.argv[index + 1] ?? ''
}

if (!existsSync(keyPath)) {
  console.error(`Missing ${keyPath}. Generate a key before issuing codes.`)
  process.exit(1)
}

const name = arg('name').trim()
const email = arg('email').trim()
const expires = arg('expires').trim()
if (!name || !email) {
  console.error('Usage: node scripts/issue-license.mjs --name "Name" --email "mail@example.com" [--expires 2027-01-01]')
  process.exit(1)
}
if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
  console.error('Expiry must look like 2027-01-01')
  process.exit(1)
}

const payload = Buffer.from(JSON.stringify({ v: 1, name, email, exp: expires || null }))
const key = createPrivateKey(readFileSync(keyPath, 'utf8'))
const signature = sign(null, payload, key)
console.log(`${payload.toString('base64url')}.${signature.toString('base64url')}`)
