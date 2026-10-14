import type { Zone } from './types'
import { ZONE_FOLDER } from './types'

export function zoneFolder(zone: Zone): 'Note' | 'Routine' {
  return ZONE_FOLDER[zone]
}

export function normalizePosix(input: string): string | null {
  const parts: string[] = []
  for (const part of input.split(/[/\\]/)) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (parts.length === 0) return null
      parts.pop()
      continue
    }
    parts.push(part)
  }
  return parts.join('/')
}

export function imageVaultPath(noteRel: string, src: string): string | null {
  const trimmed = src.trim()
  if (!trimmed || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(trimmed)) return null
  const slash = noteRel.indexOf('/')
  if (slash <= 0) return null
  const id = noteRel.slice(0, slash)
  const noteDir = noteRel.slice(slash + 1).split('/').slice(0, -1).join('/')
  const combined = `${id}/${noteDir ? `${noteDir}/` : ''}${trimmed}`
  const normalized = normalizePosix(combined)
  if (!normalized || !normalized.startsWith(`${id}/`)) return null
  return normalized
}

export function vaultUrlFromPosix(posixPath: string): string {
  return `vault://asset/${posixPath.split('/').map(encodeURIComponent).join('/')}`
}
