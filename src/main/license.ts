import { createPublicKey, verify, type KeyObject } from 'crypto'

export const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAqjYQmGb7kctSBfSw9V053ASry7iQDaXW5nb9nWfVRgI=
-----END PUBLIC KEY-----
`

export type LicenseInfo = {
  name: string
  email: string
  exp: string | null
}

type Payload = {
  v: number
  name: string
  email: string
  exp: string | null
}

export function verifyLicenseCode(code: string, publicKeyPem: string, now = new Date()): LicenseInfo | null {
  const trimmed = code.trim()
  const parts = trimmed.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  let payload: Payload
  try {
    payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as Payload
  } catch {
    return null
  }
  if (!payload || payload.v !== 1 || typeof payload.name !== 'string' || typeof payload.email !== 'string') return null
  if (payload.exp !== null && (typeof payload.exp !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(payload.exp))) return null
  const data = Buffer.from(parts[0], 'base64url')
  let key: KeyObject
  try {
    key = createPublicKey(publicKeyPem)
  } catch {
    return null
  }
  const signature = Buffer.from(parts[1], 'base64url')
  const ok = verify(null, data, key, signature)
  if (!ok) return null
  if (payload.exp && now.toISOString().slice(0, 10) > payload.exp) return null
  return { name: payload.name, email: payload.email, exp: payload.exp }
}

export function verifyLicense(code: string | null | undefined, now = new Date()): LicenseInfo | null {
  if (!code) return null
  return verifyLicenseCode(code, LICENSE_PUBLIC_KEY, now)
}
