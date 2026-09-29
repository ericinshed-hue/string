import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import type { TreeNode } from '@shared/types'
import { IconLock, IconTrash } from './Icons'

type MenuState =
  | { kind: 'entry'; x: number; y: number; path: string; entry: 'file' | 'folder'; encrypted: boolean }
  | { kind: 'blank'; x: number; y: number }

type Props = {
  tree: TreeNode[]
  openPath: string | null
  onOpen: (path: string) => void
  onCreateFile: (parent: string, name: string) => void
  onCreateFolder: (parent: string, name: string) => void
  onRename: (path: string, name: string) => void
  onDelete: (path: string) => void
  onMove: (from: string, to: string) => void
  onTrash: () => void
  onReveal: (path: string) => void
  onCopyPath: (path: string, kind: 'absolute' | 'relative') => void
  onCopyEntry: (path: string) => void
  onPaste: () => void
  onOpenRoot: () => void
  onEncrypt: (path: string) => void
  onDecrypt: (path: string) => void
  canPaste: () => Promise<boolean>
}

export function FileTree(props: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(collectFolderPaths(props.tree)))
  const [selected, setSelected] = useState<string>('')
  const [draft, setDraft] = useState<{ parent: string; kind: 'file' | 'folder' } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [pasteEnabled, setPasteEnabled] = useState(false)
  const seenFolders = useRef<Set<string>>(new Set(collectFolderPaths(props.tree)))
  const treeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const folders = new Set(collectFolderPaths(props.tree))
    setExpanded((current) => {
      const next = new Set(current)
      for (const path of folders) {
        if (!seenFolders.current.has(path)) next.add(path)
      }
      for (const path of current) {
        if (!folders.has(path)) next.delete(path)
      }
      return next
    })
    seenFolders.current = folders
  }, [props.tree])

  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    const onPointer = (event: PointerEvent): void => {
      if (event.button === 2) return
      const target = event.target
      if (target instanceof Node && document.getElementById('tree-menu')?.contains(target)) return
      close()
    }
    const onContext = (event: MouseEvent): void => {
      const root = treeRef.current
      const target = event.target
      if (root && target instanceof Node && root.contains(target)) return
      close()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('contextmenu', onContext)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('contextmenu', onContext)
      window.removeEventListener('blur', close)
    }
  }, [menu])

  const parent = selected.includes('/') || props.tree.some((node) => node.path === selected && node.type === 'folder')
    ? folderParent(props.tree, selected)
    : ''

  function openBlankMenu(event: ReactMouseEvent): void {
    event.preventDefault()
    setMenu({ kind: 'blank', x: event.clientX, y: event.clientY })
    setPasteEnabled(false)
    void props.canPaste().then(setPasteEnabled).catch(() => setPasteEnabled(false))
  }

  function openEntryMenu(event: ReactMouseEvent, node: TreeNode): void {
    event.preventDefault()
    event.stopPropagation()
    setSelected(node.path)
    setMenu({
      kind: 'entry',
      x: event.clientX,
      y: event.clientY,
      path: node.path,
      entry: node.type === 'folder' ? 'folder' : 'file',
      encrypted: node.type === 'file' && node.encrypted === true
    })
  }

  return (
    <div className="tree" ref={treeRef}>
      <div className="tree-tools">
        <button onClick={() => setDraft({ parent, kind: 'file' })}>New note</button>
        <button onClick={() => setDraft({ parent: '', kind: 'folder' })}>New folder</button>
      </div>
      <div className="tree-scroll" onClick={() => setSelected('')} onContextMenu={openBlankMenu}>
        {draft && draft.parent === '' ? (
          <NameRow
            kind={draft.kind}
            onCancel={() => setDraft(null)}
            onSubmit={(name) => {
              if (draft.kind === 'file') props.onCreateFile('', name)
              else props.onCreateFolder('', name)
              setDraft(null)
            }}
          />
        ) : null}
        {props.tree.map((node) => (
          <NodeRow
            key={node.path}
            node={node}
            depth={0}
            expanded={expanded}
            openPath={props.openPath}
            renaming={renaming}
            draft={draft}
            onToggle={(path) => {
              setExpanded((current) => {
                const next = new Set(current)
                if (next.has(path)) next.delete(path)
                else next.add(path)
                return next
              })
            }}
            onSelect={setSelected}
            onOpen={props.onOpen}
            onRenameStart={setRenaming}
            onRename={(path, name) => {
              if (path && name) props.onRename(path, name)
              setRenaming(null)
            }}
            onDelete={props.onDelete}
            onMove={props.onMove}
            onDraftSubmit={(parentPath, kind, name) => {
              if (kind === 'file') props.onCreateFile(parentPath, name)
              else props.onCreateFolder(parentPath, name)
              setDraft(null)
              setExpanded((current) => new Set(current).add(parentPath))
            }}
            onDraftCancel={() => setDraft(null)}
            onCreateInside={(path) => {
              setDraft({ parent: path, kind: 'folder' })
              setExpanded((current) => new Set(current).add(path))
            }}
            menuPath={menu?.kind === 'entry' ? menu.path : null}
            onContextMenu={openEntryMenu}
          />
        ))}
        {props.tree.length === 0 && !draft ? <p className="tree-empty">No notes yet</p> : null}
      </div>
      <button className="trash-entry" onClick={props.onTrash} title="Trash" aria-label="Trash">
        <IconTrash />
      </button>
      {menu ? (
        <TreeMenu
          menu={menu}
          pasteEnabled={pasteEnabled}
          onClose={() => setMenu(null)}
          onReveal={props.onReveal}
          onRenameStart={setRenaming}
          onDelete={props.onDelete}
          onCopyPath={props.onCopyPath}
          onCopyEntry={props.onCopyEntry}
          onNewFile={() => setDraft({ parent: '', kind: 'file' })}
          onNewFolder={() => setDraft({ parent: '', kind: 'folder' })}
          onPaste={props.onPaste}
          onOpenRoot={props.onOpenRoot}
          onEncrypt={props.onEncrypt}
          onDecrypt={props.onDecrypt}
        />
      ) : null}
    </div>
  )
}

function folderParent(tree: TreeNode[], selected: string): string {
  const node = findNode(tree, selected)
  if (!node) return ''
  if (node.type === 'folder') return node.path
  const index = selected.lastIndexOf('/')
  return index < 0 ? '' : selected.slice(0, index)
}

function collectFolderPaths(nodes: TreeNode[], into: string[] = []): string[] {
  for (const node of nodes) {
    if (node.type !== 'folder') continue
    into.push(node.path)
    if (node.children) collectFolderPaths(node.children, into)
  }
  return into
}

function findNode(nodes: TreeNode[], path: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node
    if (node.children) {
      const found = findNode(node.children, path)
      if (found) return found
    }
  }
  return null
}

type RowProps = {
  node: TreeNode
  depth: number
  expanded: Set<string>
  openPath: string | null
  renaming: string | null
  draft: { parent: string; kind: 'file' | 'folder' } | null
  onToggle: (path: string) => void
  onSelect: (path: string) => void
  onOpen: (path: string) => void
  onRenameStart: (path: string) => void
  onRename: (path: string, name: string) => void
  onDelete: (path: string) => void
  onMove: (from: string, to: string) => void
  onDraftSubmit: (parent: string, kind: 'file' | 'folder', name: string) => void
  onDraftCancel: () => void
  onCreateInside: (path: string) => void
  menuPath: string | null
  onContextMenu: (event: ReactMouseEvent, node: TreeNode) => void
}

function NodeRow(props: RowProps) {
  const open = props.expanded.has(props.node.path)
  const label = props.node.name.replace(/\.md$/i, '')
  return (
    <div>
      {props.renaming === props.node.path ? (
        <NameRow
          depth={props.depth}
          initial={props.node.name}
          kind={props.node.type === 'folder' ? 'folder' : 'file'}
          onCancel={() => props.onRename('', '')}
          onSubmit={(name) => props.onRename(props.node.path, name)}
        />
      ) : (
        <div
          className={['tree-row', props.openPath === props.node.path ? 'open' : '', props.menuPath === props.node.path ? 'menu-target' : ''].filter(Boolean).join(' ')}
          onContextMenu={(event) => props.onContextMenu(event, props.node)}
          style={{ paddingLeft: 12 + props.depth * 14 }}
          draggable
          onDragStart={(event) => event.dataTransfer.setData('text/plain', props.node.path)}
          onDragOver={(event) => {
            if (props.node.type === 'folder') event.preventDefault()
          }}
          onDrop={(event) => {
            if (props.node.type !== 'folder') return
            event.preventDefault()
            const from = event.dataTransfer.getData('text/plain')
            if (from) props.onMove(from, props.node.path)
          }}
          onClick={(event) => {
            event.stopPropagation()
            props.onSelect(props.node.path)
            if (props.node.type === 'folder') props.onToggle(props.node.path)
            else props.onOpen(props.node.path)
          }}
        >
          <span className="tree-mark">
            {props.node.type === 'folder' ? (open ? '▾' : '▸') : props.node.encrypted ? <IconLock /> : ''}
          </span>
          <span className="tree-name" title={label}>{label}</span>
          <span className="tree-actions">
            {props.node.type === 'folder' ? (
              <button
                onClick={(event) => {
                  event.stopPropagation()
                  props.onCreateInside(props.node.path)
                }}
              >
                Subfolder
              </button>
            ) : null}
            <button
              onClick={(event) => {
                event.stopPropagation()
                props.onRenameStart(props.node.path)
              }}
            >
              Rename
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation()
                props.onDelete(props.node.path)
              }}
            >
              Delete
            </button>
          </span>
        </div>
      )}
      {props.node.type === 'folder' && open ? (
        <div>
          {props.draft?.parent === props.node.path ? (
            <NameRow
              depth={props.depth + 1}
              kind={props.draft.kind}
              onCancel={props.onDraftCancel}
              onSubmit={(name) => props.onDraftSubmit(props.node.path, props.draft!.kind, name)}
            />
          ) : null}
          {props.node.children?.map((child) => (
            <NodeRow key={child.path} {...props} node={child} depth={props.depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function NameRow({
  depth = 0,
  initial = '',
  kind,
  onSubmit,
  onCancel
}: {
  depth?: number
  initial?: string
  kind: 'file' | 'folder'
  onSubmit: (name: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial.replace(/\.md$/i, ''))
  const formRef = useRef<HTMLFormElement>(null)
  const onCancelRef = useRef(onCancel)
  const committed = useRef(false)
  onCancelRef.current = onCancel

  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      if (committed.current) return
      const form = formRef.current
      if (!form || form.contains(event.target as Node)) return
      onCancelRef.current()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  return (
    <form
      ref={formRef}
      className="tree-draft"
      onContextMenu={(event) => event.stopPropagation()}
      style={{ paddingLeft: 12 + depth * 14 }}
      onSubmit={(event) => {
        event.preventDefault()
        const name = value.trim()
        if (!name) return
        committed.current = true
        onSubmit(kind === 'file' && !name.toLowerCase().endsWith('.md') ? `${name}.md` : name)
      }}
    >
      <input
        autoFocus
        value={value}
        placeholder={kind === 'file' ? 'Note name' : 'Folder name'}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => {
          if (!committed.current) onCancelRef.current()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
        }}
      />
    </form>
  )
}

function TreeMenu({
  menu,
  pasteEnabled,
  onClose,
  onReveal,
  onRenameStart,
  onDelete,
  onCopyPath,
  onCopyEntry,
  onNewFile,
  onNewFolder,
  onPaste,
  onOpenRoot,
  onEncrypt,
  onDecrypt
}: {
  menu: MenuState
  pasteEnabled: boolean
  onClose: () => void
  onReveal: (path: string) => void
  onRenameStart: (path: string) => void
  onDelete: (path: string) => void
  onCopyPath: (path: string, kind: 'absolute' | 'relative') => void
  onCopyEntry: (path: string) => void
  onNewFile: () => void
  onNewFolder: () => void
  onPaste: () => void
  onOpenRoot: () => void
  onEncrypt: (path: string) => void
  onDecrypt: (path: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8))
    const y = Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8))
    el.style.left = `${x}px`
    el.style.top = `${y}px`
  }, [menu])

  function run(action: () => void): void {
    onClose()
    action()
  }

  const items: Array<{ label: string; danger?: boolean; disabled?: boolean; divider?: boolean; run: () => void }> = menu.kind === 'entry'
    ? [
        { label: 'Open file location', run: () => run(() => onReveal(menu.path)) },
        { label: 'Rename', run: () => run(() => onRenameStart(menu.path)) },
        { label: 'Delete', danger: true, run: () => run(() => onDelete(menu.path)) },
        ...(menu.entry === 'file'
          ? [{
              label: menu.encrypted ? 'Decrypt' : 'Encrypt',
              run: () => run(() => (menu.encrypted ? onDecrypt(menu.path) : onEncrypt(menu.path)))
            }]
          : []),
        { divider: true, label: '', run: () => undefined },
        { label: 'Copy absolute path', run: () => run(() => onCopyPath(menu.path, 'absolute')) },
        { label: 'Copy relative path', run: () => run(() => onCopyPath(menu.path, 'relative')) },
        { label: menu.entry === 'folder' ? 'Copy folder' : 'Copy file', run: () => run(() => onCopyEntry(menu.path)) }
      ]
    : [
        { label: 'New folder', run: () => run(onNewFolder) },
        { label: 'New file', run: () => run(onNewFile) },
        { label: 'Paste', disabled: !pasteEnabled, run: () => run(onPaste) },
        { divider: true, label: '', run: () => undefined },
        { label: 'Open root location', run: () => run(onOpenRoot) }
      ]

  return createPortal(
    <div
      id="tree-menu"
      ref={ref}
      className="context-menu"
      style={{ left: menu.x, top: menu.y }}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item, index) =>
        item.divider ? (
          <hr key={index} />
        ) : (
          <button
            key={item.label}
            type="button"
            className={item.danger ? 'danger' : undefined}
            disabled={item.disabled}
            onClick={item.run}
          >
            {item.label}
          </button>
        )
      )}
    </div>,
    document.body
  )
}
