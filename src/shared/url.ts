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

export function imageVaultPath(zone: Zone, noteRel: string, src: string): string | null {
  const trimmed = src.trim()
  if (!trimmed || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(trimmed)) return null
  const noteDir = noteRel.split('/').slice(0, -1).join('/')
  const combined = `${zoneFolder(zone)}/${noteDir ? `${noteDir}/` : ''}${trimmed}`
  const normalized = normalizePosix(combined)
  const folder = zoneFolder(zone)
  if (!normalized || normalized === folder || !normalized.startsWith(`${folder}/`)) return null
  return normalized
}

export function vaultUrlFromPosix(posixPath: string): string {
  return `vault://asset/${posixPath.split('/').map(encodeURIComponent).join('/')}`
}
