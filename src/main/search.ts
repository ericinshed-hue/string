import type { SearchHit, Zone } from '../shared/types'
import { walkNotes } from './vault'

type IndexedFile = {
  path: string
  name: string
  lines: string[]
}

const indexes = new Map<Zone, IndexedFile[]>()

export function invalidateSearch(zone?: Zone): void {
  if (zone) indexes.delete(zone)
  else indexes.clear()
}

export async function searchNotes(vaultRoot: string, zone: Zone, query: string): Promise<SearchHit[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  let files = indexes.get(zone)
  if (!files) {
    const notes = await walkNotes(vaultRoot, zone)
    files = notes.map((note) => ({
      path: note.path,
      name: note.name,
      lines: note.content.split(/\r?\n/)
    }))
    indexes.set(zone, files)
  }
  const hits: SearchHit[] = []
  for (const file of files) {
    if (file.name.toLowerCase().includes(q) || file.path.toLowerCase().includes(q)) {
      hits.push({ path: file.path, name: file.name, line: 1, snippet: file.path, kind: 'name' })
    }
    for (let i = 0; i < file.lines.length; i++) {
      const line = file.lines[i] ?? ''
      const at = line.toLowerCase().indexOf(q)
      if (at < 0) continue
      const start = Math.max(0, at - 28)
      hits.push({
        path: file.path,
        name: file.name,
        line: i + 1,
        snippet: line.slice(start, start + 96).trim(),
        kind: 'content'
      })
      if (hits.length >= 80) return hits
    }
  }
  return hits
}
