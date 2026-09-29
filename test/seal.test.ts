import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isSealed, openText, sealText } from '../src/main/seal.ts'

describe('seal', () => {
  it('round-trips a note and hides the plaintext', async () => {
    const envelope = await sealText('secret diary', 'correct horse')
    assert.equal(isSealed(envelope), true)
    assert.equal(envelope.includes('secret diary'), false)
    assert.equal(await openText(envelope, 'correct horse'), 'secret diary')
  })

  it('rejects a wrong password and a plain note', async () => {
    const envelope = await sealText('night', 'one')
    await assert.rejects(() => openText(envelope, 'two'), /Wrong password/)
    await assert.rejects(() => openText('# hello', 'one'), /not encrypted/)
    await assert.rejects(() => sealText('night', ''), /Enter a password/)
  })
})
