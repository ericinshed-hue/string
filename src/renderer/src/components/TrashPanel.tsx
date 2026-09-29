import { useState } from 'react'
import type { TrashItem } from '@shared/types'

type Props = {
  items: TrashItem[]
  onBack: () => void
  onRestore: (id: string) => void
  onEmpty: () => void
}

export function TrashPanel({ items, onBack, onRestore, onEmpty }: Props) {
  const [armed, setArmed] = useState(false)
  return (
    <div className="tree">
      <div className="tree-tools">
        <button onClick={onBack}>Back</button>
        <button
          onClick={() => {
            if (items.length === 0) return
            if (!armed) {
              setArmed(true)
              return
            }
            setArmed(false)
            onEmpty()
          }}
          disabled={items.length === 0}
        >
          {armed ? 'Click again to empty' : 'Empty'}
        </button>
      </div>
      <div className="tree-scroll">
        {items.length === 0 ? <p className="tree-empty">Trash is empty</p> : null}
        {items.map((item) => (
          <div className="trash-row" key={item.id}>
            <div>
              <strong>{item.name.replace(/\.md$/i, '')}</strong>
              <p>{item.originalRelativePath}</p>
            </div>
            <button onClick={() => onRestore(item.id)}>Restore</button>
          </div>
        ))}
      </div>
    </div>
  )
}
