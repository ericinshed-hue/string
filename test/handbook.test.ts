import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canonicalizeChord,
  defaultHandbook,
  expandRule,
  findTrigger,
  formatWhen,
  prepareHandbook,
  prepareShortcuts
} from '../src/shared/handbook.ts'

describe('handbook', () => {
  const now = new Date(2026, 8, 26, 16, 7, 4)

  it('formats local date and time tokens', () => {
    assert.equal(formatWhen(now, 'HH:mm'), '16:07')
    assert.equal(formatWhen(now, 'HH:mm:ss'), '16:07:04')
    assert.equal(formatWhen(now, 'YYYY-MM-DD'), '2026-09-26')
    assert.equal(formatWhen(now, 'YYYY年MM月DD日'), '2026年09月26日')
  })

  it('matches a finished trigger at the caret', () => {
    const rules = defaultHandbook()
    assert.equal(findTrigger('今天 \\time', rules)?.rule.kind, 'time')
    assert.equal(findTrigger('\\date', rules)?.rule.kind, 'date')
    assert.equal(findTrigger('\\tim', rules), null)
    assert.equal(findTrigger('runtime', [{ ...rules[0], trigger: 'time' }]), null)
  })

  it('keeps a custom phrase and expands it literally', () => {
    const custom = { id: 'sig', trigger: '::hi', kind: 'text' as const, format: '你好', enabled: true }
    const saved = prepareHandbook([...defaultHandbook(), custom])
    assert.equal(saved.find((rule) => rule.id === 'sig')?.format, '你好')
    assert.equal(expandRule(custom, now), '你好')
    assert.equal(findTrigger('说 ::hi', saved)?.rule.id, 'sig')
    assert.throws(() => prepareHandbook([...defaultHandbook(), { ...custom, trigger: '\\time' }]), /unique/)
  })

  it('rejects duplicate triggers and blank shortcuts', () => {
    const rules = defaultHandbook()
    assert.throws(() => prepareHandbook(rules.map((rule) => ({ ...rule, trigger: '\\now' }))), /unique/)
    assert.equal(canonicalizeChord('ctrl+b'), 'Ctrl+B')
    assert.equal(canonicalizeChord('alt+1'), 'Alt+1')
    assert.throws(() => prepareShortcuts([{ action: 'bold', chord: 'B' }]), /invalid/)
  })
})
