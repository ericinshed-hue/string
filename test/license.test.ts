import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, it } from 'node:test'
import { verifyLicenseCode } from '../src/main/license.ts'

function issue(privatePem: string, payload: { v: number; name: string; email: string; exp: string | null }): string {
  const body = Buffer.from(JSON.stringify(payload))
  const signature = sign(null, body, privatePem)
  return `${body.toString('base64url')}.${signature.toString('base64url')}`
}

describe('license', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

  it('accepts a signed code and rejects a tampered one', () => {
    const code = issue(privatePem, { v: 1, name: 'Ada', email: 'ada@example.com', exp: null })
    assert.deepEqual(verifyLicenseCode(code, publicPem, new Date('2026-01-01')), {
      name: 'Ada',
      email: 'ada@example.com',
      exp: null
    })
    assert.equal(verifyLicenseCode(`${code}x`, publicPem), null)
  })

  it('rejects a code after its expiry date', () => {
    const code = issue(privatePem, { v: 1, name: 'Ada', email: 'ada@example.com', exp: '2026-01-01' })
    assert.equal(verifyLicenseCode(code, publicPem, new Date('2026-01-02T00:00:00Z')), null)
    assert.ok(verifyLicenseCode(code, publicPem, new Date('2026-01-01T00:00:00Z')))
  })
})
