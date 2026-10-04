import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applySkills, prepareSkills } from '../src/shared/skills.ts'
import type { Skill } from '../src/shared/types.ts'

const review: Skill = { id: '1', name: 'review', instructions: 'Be a strict reviewer.' }

describe('skills', () => {
  it('hides the trigger and keeps the original sentence for display', () => {
    const applied = applySkills('Look at Daily.md \\review', [review])
    assert.equal(applied.display, 'Look at Daily.md \\review')
    assert.equal(applied.content.includes('\\review'), false)
    assert.match(applied.content, /Be a strict reviewer\./)
    assert.match(applied.content, /Look at Daily\.md/)
  })

  it('leaves an unknown token in the message and allows a skill on its own', () => {
    assert.equal(applySkills('hello \\missing', [review]).content, 'hello \\missing')
    assert.equal(applySkills('\\review', [review]).content, 'Be a strict reviewer.')
  })

  it('rejects a bad or duplicate name', () => {
    assert.throws(() => prepareSkills([{ id: '1', name: '1bad', instructions: 'x' }]), /letter/)
    assert.throws(
      () => prepareSkills([
        { id: '1', name: 'review', instructions: 'a' },
        { id: '2', name: 'review', instructions: 'b' }
      ]),
      /unique/
    )
  })
})
