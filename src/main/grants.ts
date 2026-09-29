import type { Zone } from '../shared/types'
import { normalizePosix } from '../shared/paths'

const grants = new Map<string, string>()

function key(zone: Zone, rel: string): string | null {
  const normalized = normalizePosix(rel)
  if (!normalized) return null
  return `${zone}:${normalized}`
}

export function grantSecret(zone: Zone, rel: string, password: string): void {
  const id = key(zone, rel)
  if (!id || !password) return
  grants.set(id, password)
}

export function revokeSecret(zone: Zone, rel: string): void {
  const id = key(zone, rel)
  if (id) grants.delete(id)
}

export function grantedPassword(zone: Zone, rel: string): string | undefined {
  const id = key(zone, rel)
  if (!id) return undefined
  return grants.get(id)
}
