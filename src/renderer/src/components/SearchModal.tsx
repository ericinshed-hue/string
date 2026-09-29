import { useEffect, useState } from 'react'
import type { SearchHit, Zone } from '@shared/types'

type Props = {
  zone: Zone
  onClose: () => void
  onOpen: (path: string) => void
}

export function SearchModal({ zone, onClose, onOpen }: Props) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (!query.trim()) {
        setHits([])
        return
      }
      void window.routine.search(zone, query).then(setHits)
    }, 120)
    return () => window.clearTimeout(handle)
  }, [query, zone])

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="search-modal" onMouseDown={(event) => event.stopPropagation()}>
        <input
          autoFocus
          value={query}
          placeholder={zone === 'note' ? 'Search the diary' : 'Search the day log'}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose()
            if (event.key === 'Enter' && hits[0]) {
              onOpen(hits[0].path)
              onClose()
            }
          }}
        />
        <div className="search-results">
          {query.trim() && hits.length === 0 ? <p className="tree-empty">No matches</p> : null}
          {hits.map((hit, index) => (
            <button
              key={`${hit.path}-${hit.line}-${index}`}
              className="search-hit"
              onClick={() => {
                onOpen(hit.path)
                onClose()
              }}
            >
              <span>{hit.name.replace(/\.md$/i, '')}</span>
              <small>
                {hit.kind === 'name' ? hit.path : `Line ${hit.line} · ${hit.snippet}`}
              </small>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
