import type { SearchHit, Zone } from '../shared/types'
import { walkNotes } from './vault'

type IndexedFile = {
  path: string
  name: string
  lines: string[]
}

let indexed: IndexedFile[] | null = null

export function invalidateSearch(_zone?: Zone): void {
  indexed = null
}

export async function searchNotes(libraries: string[], query: string): Promise<SearchHit[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  let files = indexed
  if (!files) {
    const notes = await walkNotes(libraries)
    files = notes.map((note) => ({
      path: note.path,
      name: note.name,
      lines: note.content.split(/\r?\n/)
    }))
    indexed = files
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
