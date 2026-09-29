import type { HandbookRule, ShortcutAction, ShortcutBinding } from './types'

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  bold: 'Bold',
  italic: 'Italic',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  h4: 'Heading 4',
  h5: 'Heading 5',
  h6: 'Heading 6'
}

export function defaultHandbook(): HandbookRule[] {
  return [
    { id: 'time', trigger: '\\time', kind: 'time', format: 'HH:mm', enabled: true },
    { id: 'date', trigger: '\\date', kind: 'date', format: 'YYYY-MM-DD', enabled: true }
  ]
}

export function defaultShortcuts(): ShortcutBinding[] {
  return [
    { action: 'bold', chord: 'Ctrl+B' },
    { action: 'italic', chord: 'Ctrl+I' },
    { action: 'h1', chord: 'Alt+1' },
    { action: 'h2', chord: 'Alt+2' },
    { action: 'h3', chord: 'Alt+3' },
    { action: 'h4', chord: 'Alt+4' },
    { action: 'h5', chord: 'Alt+5' },
    { action: 'h6', chord: 'Alt+6' }
  ]
}

export function formatWhen(now: Date, pattern: string): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const tokens: Record<string, string> = {
    YYYY: String(now.getFullYear()),
    MM: pad(now.getMonth() + 1),
    DD: pad(now.getDate()),
    HH: pad(now.getHours()),
    mm: pad(now.getMinutes()),
    ss: pad(now.getSeconds())
  }
  return pattern.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => tokens[token] ?? token)
}

export function expandRule(rule: HandbookRule, now = new Date()): string {
  if (rule.kind === 'text') return rule.format
  return formatWhen(now, rule.format)
}

export function findTrigger(before: string, rules: HandbookRule[]): { rule: HandbookRule; start: number } | null {
  const enabled = rules
    .filter((rule) => rule.enabled && rule.trigger.length > 0)
    .slice()
    .sort((a, b) => b.trigger.length - a.trigger.length)
  for (const rule of enabled) {
    if (!before.endsWith(rule.trigger)) continue
    const start = before.length - rule.trigger.length
    const prev = start > 0 ? before[start - 1] : ''
    const triggerStartsPlain = /^[\p{L}\p{N}_]/u.test(rule.trigger)
    if (triggerStartsPlain && prev && /[\p{L}\p{N}_]/u.test(prev)) continue
    return { rule, start }
  }
  return null
}

export function canonicalizeChord(input: string): string | null {
  const parts = input.split('+').map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2) return null
  let ctrl = false
  let alt = false
  let shift = false
  let key = ''
  for (const part of parts) {
    const lower = part.toLowerCase()
    if (lower === 'ctrl' || lower === 'control' || lower === 'meta' || lower === 'cmd' || lower === 'command') {
      ctrl = true
    } else if (lower === 'alt' || lower === 'option') {
      alt = true
    } else if (lower === 'shift') {
      shift = true
    } else if (!key) {
      key = normalizeKey(part)
      if (!key) return null
    } else {
      return null
    }
  }
  if (!key || (!ctrl && !alt && !shift)) return null
  return [...(ctrl ? ['Ctrl'] : []), ...(alt ? ['Alt'] : []), ...(shift ? ['Shift'] : []), key].join('+')
}

function normalizeKey(part: string): string {
  if (/^[0-9]$/.test(part)) return part
  if (/^[a-zA-Z]$/.test(part)) return part.toUpperCase()
  return ''
}

export function chordFromEvent(event: KeyboardEvent): string | null {
  if (event.isComposing || event.repeat) return null
  if (event.key === 'Control' || event.key === 'Alt' || event.key === 'Shift' || event.key === 'Meta') return null
  if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) return null
  let key = ''
  if (/^Digit[0-9]$/.test(event.code)) key = event.code.slice(5)
  else if (/^Key[A-Z]$/.test(event.code)) key = event.code.slice(3)
  if (!key) return null
  const parts = [
    ...(event.ctrlKey || event.metaKey ? ['Ctrl'] : []),
    ...(event.altKey ? ['Alt'] : []),
    ...(event.shiftKey ? ['Shift'] : []),
    key
  ]
  return parts.join('+')
}

export function coerceHandbook(value: unknown): HandbookRule[] {
  const list = Array.isArray(value) ? (value as Partial<HandbookRule>[]) : []
  const builtin = defaultHandbook().map((def) => {
    const found = list.find((item) => item && item.kind === def.kind)
    if (!found) return { ...def }
    const trigger = typeof found.trigger === 'string' ? found.trigger : def.trigger
    const format = typeof found.format === 'string' ? found.format : def.format
    return {
      id: def.id,
      kind: def.kind,
      trigger: trigger.trim() ? trigger : def.trigger,
      format: format.trim() ? format : def.format,
      enabled: found.enabled !== false
    }
  })
  const custom = list.flatMap((item): HandbookRule[] => {
    if (!item || item.kind !== 'text') return []
    const id = typeof item.id === 'string' ? item.id.trim() : ''
    const trigger = typeof item.trigger === 'string' ? item.trigger : ''
    const format = typeof item.format === 'string' ? item.format : ''
    if (!id || id === 'time' || id === 'date' || !trigger.trim()) return []
    return [{ id, kind: 'text', trigger, format, enabled: item.enabled !== false }]
  })
  return [...builtin, ...custom]
}

export function prepareHandbook(list: HandbookRule[]): HandbookRule[] {
  const builtin = defaultHandbook().map((def) => {
    const found = list.find((item) => item.kind === def.kind)
    if (!found) return { ...def }
    return {
      id: def.id,
      kind: def.kind,
      trigger: found.trigger,
      format: found.format.trim(),
      enabled: found.enabled
    }
  })
  const custom: HandbookRule[] = list
    .filter((item) => item.kind === 'text')
    .map((item) => ({
      id: item.id.trim() || crypto.randomUUID(),
      kind: 'text',
      trigger: item.trigger,
      format: item.format,
      enabled: item.enabled
    }))
  const next = [...builtin, ...custom]
  for (const rule of next) {
    if (!rule.trigger.trim()) throw new Error('Trigger cannot be empty')
    if (/\s/.test(rule.trigger)) throw new Error('Triggers cannot contain spaces')
    if (rule.kind === 'text') {
      if (!rule.format) throw new Error('Output cannot be empty')
    } else if (!rule.format.trim()) {
      throw new Error('Format cannot be empty')
    }
  }
  const enabled = next.filter((rule) => rule.enabled).map((rule) => rule.trigger)
  if (new Set(enabled).size !== enabled.length) throw new Error('Triggers must be unique')
  return next
}

export function coerceShortcuts(value: unknown): ShortcutBinding[] {
  const list = Array.isArray(value) ? (value as Partial<ShortcutBinding>[]) : []
  return defaultShortcuts().map((def) => {
    const found = list.find((item) => item && item.action === def.action)
    const chord = canonicalizeChord(typeof found?.chord === 'string' ? found.chord : '')
    return { action: def.action, chord: chord ?? def.chord }
  })
}

export function prepareShortcuts(list: ShortcutBinding[]): ShortcutBinding[] {
  const next = defaultShortcuts().map((def) => {
    const found = list.find((item) => item.action === def.action)
    const chord = canonicalizeChord(found?.chord ?? '')
    if (!chord) throw new Error(`${SHORTCUT_LABELS[def.action]} shortcut is invalid`)
    return { action: def.action, chord }
  })
  const chords = next.map((item) => item.chord)
  if (new Set(chords).size !== chords.length) throw new Error('Shortcuts must be unique')
  return next
}
