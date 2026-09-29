import { useCallback, useEffect, useRef, useState } from 'react'
import { coerceEditorFont, editorFontStack } from '@shared/fonts'
import { coerceHandbook, coerceShortcuts } from '@shared/handbook'
import type { PublicSettings, TrashItem, TreeNode, Zone } from '@shared/types'
import { AiDrawer } from './components/AiDrawer'
import { EditorPane } from './components/EditorPane'
import { FileTree } from './components/FileTree'
import { PasswordDialog } from './components/PasswordDialog'
import { SearchModal } from './components/SearchModal'
import { SettingsModal } from './components/SettingsModal'
import { TitleBar } from './components/TitleBar'
import { UpdateNotice } from './components/UpdateNotice'
import { TrashPanel } from './components/TrashPanel'
import { Welcome } from './components/Welcome'

const DAY = '#f7f6f3'
const NIGHT = '#161618'
const TREE_WIDTH_KEY = 'routine.treeWidth'
const TREE_MIN = 200
const TREE_MAX = 720

function readTreeWidth(): number {
  const saved = Number(localStorage.getItem(TREE_WIDTH_KEY))
  if (!Number.isFinite(saved)) return 252
  return Math.min(TREE_MAX, Math.max(TREE_MIN, saved))
}

export function App() {
  const [booting, setBooting] = useState(true)
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [zone, setZone] = useState<Zone>('routine')
  const [treeOpen, setTreeOpen] = useState(true)
  const [treeWidth, setTreeWidth] = useState(readTreeWidth)
  const treeWidthRef = useRef(treeWidth)
  treeWidthRef.current = treeWidth
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [tree, setTree] = useState<TreeNode[]>([])
  const [trash, setTrash] = useState<TrashItem[]>([])
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [initial, setInitial] = useState('')
  const [loadToken, setLoadToken] = useState(0)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'dirty'>('saved')
  const [toast, setToast] = useState('')
  const [chars, setChars] = useState(0)
  const [gate, setGate] = useState<{ mode: 'encrypt' | 'unlock' | 'decrypt'; zone: Zone; path: string } | null>(null)
  const [gateError, setGateError] = useState('')
  const [update, setUpdate] = useState<{ phase: 'available' | 'downloading' | 'ready'; version: string; notes: string; percent: number } | null>(null)

  useEffect(() => {
    document.documentElement.style.setProperty('--editor-font', editorFontStack(settings?.editorFont))
  }, [settings?.editorFont])

  const zoneRef = useRef(zone)
  const pathRef = useRef<string | null>(null)
  const contentRef = useRef('')
  const dirtyRef = useRef(false)
  const ignoreReload = useRef(0)
  const toastTimer = useRef(0)
  const secretRef = useRef<{ zone: Zone; path: string; password: string } | null>(null)
  zoneRef.current = zone

  const holdSecret = useCallback(async (next: { zone: Zone; path: string; password: string } | null) => {
    const prev = secretRef.current
    secretRef.current = next
    if (prev && (!next || prev.zone !== next.zone || prev.path !== next.path)) {
      await window.routine.revoke(prev.zone, prev.path)
    }
    if (next) await window.routine.grant(next.zone, next.path, next.password)
  }, [])

  const showToast = useCallback((text: string) => {
    setToast(text)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2400)
  }, [])

  useEffect(() => {
    return window.routine.onUpdate((status) => {
      if (status.type === 'available') {
        setUpdate({ phase: 'available', version: status.version, notes: status.notes, percent: 0 })
      } else if (status.type === 'progress') {
        setUpdate((current) => (current ? { ...current, phase: 'downloading', percent: status.percent } : current))
      } else if (status.type === 'downloaded') {
        setUpdate((current) => ({ phase: 'ready', version: status.version, notes: current?.notes ?? '', percent: 100 }))
      } else if (status.type === 'none') {
        showToast(`You're up to date (${status.version})`)
      } else {
        showToast(status.message)
      }
    })
  }, [showToast])

  useEffect(() => {
    const timer = window.setTimeout(() => void window.routine.checkUpdates(true), 4000)
    return () => window.clearTimeout(timer)
  }, [])

  const paintZone = useCallback((next: Zone) => {
    setZone(next)
    document.documentElement.dataset.zone = next
    void window.routine.setBackground(next === 'note' ? NIGHT : DAY)
  }, [])

  const refresh = useCallback(async (next: Zone) => {
    const [nodes, items] = await Promise.all([window.routine.tree(next), window.routine.trash(next)])
    setTree(nodes)
    setTrash(items)
  }, [])

  const saveCurrent = useCallback(async () => {
    const rel = pathRef.current
    if (!rel || !dirtyRef.current) return
    const text = contentRef.current
    const currentZone = zoneRef.current
    const secret = secretRef.current
    setSaveState('saving')
    ignoreReload.current = Date.now() + 1000
    if (secret && secret.zone === currentZone && secret.path === rel) {
      await window.routine.writeSealed(currentZone, rel, text, secret.password)
    } else {
      await window.routine.write(currentZone, rel, text)
    }
    if (pathRef.current === rel && contentRef.current === text) {
      dirtyRef.current = false
      setSaveState('saved')
    }
  }, [])

  const applyNote = useCallback(async (nextZone: Zone, rel: string, text: string, password: string | null) => {
    await holdSecret(password ? { zone: nextZone, path: rel, password } : null)
    pathRef.current = rel
    contentRef.current = text
    dirtyRef.current = false
    setOpenPath(rel)
    setInitial(text)
    setChars(text.replace(/\s/g, '').length)
    setLoadToken((token) => token + 1)
    setSaveState('saved')
    setGate(null)
    setGateError('')
    await window.routine.remember(nextZone, rel)
    setSettings((current) =>
      current ? { ...current, lastOpen: { ...current.lastOpen, [nextZone]: rel }, lastZone: nextZone } : current
    )
  }, [holdSecret])

  const openFile = useCallback(
    async (nextZone: Zone, rel: string) => {
      if (dirtyRef.current && (pathRef.current !== rel || zoneRef.current !== nextZone)) await saveCurrent()
      if (await window.routine.sealed(nextZone, rel)) {
        await holdSecret(null)
        pathRef.current = null
        contentRef.current = ''
        dirtyRef.current = false
        setOpenPath(null)
        setInitial('')
        setChars(0)
        setGateError('')
        setGate({ mode: 'unlock', zone: nextZone, path: rel })
        await window.routine.remember(nextZone, rel)
        setSettings((current) =>
          current ? { ...current, lastOpen: { ...current.lastOpen, [nextZone]: rel }, lastZone: nextZone } : current
        )
        return
      }
      await applyNote(nextZone, rel, await window.routine.read(nextZone, rel), null)
    },
    [applyNote, holdSecret, saveCurrent]
  )

  useEffect(() => {
    let alive = true
    void (async () => {
      const loaded = await window.routine.getSettings()
      if (!alive) return
      setSettings(withEditor(loaded))
      paintZone(loaded.lastZone)
      if (loaded.vaultRoot) {
        await refresh(loaded.lastZone)
        const sample = loaded.lastZone === 'note' ? 'Note_sample.md' : 'Routine_sample.md'
        const rel = loaded.lastOpen[loaded.lastZone] ?? sample
        try {
          await openFile(loaded.lastZone, rel)
        } catch {
          pathRef.current = null
          setOpenPath(null)
        }
      }
      if (alive) setBooting(false)
    })()
    return () => {
      alive = false
    }
  }, [openFile, paintZone, refresh])

  useEffect(() => {
    return window.routine.onVaultChanged((changed) => {
      if (changed !== zoneRef.current) return
      void refresh(changed)
      if (Date.now() < ignoreReload.current || dirtyRef.current || !pathRef.current) return
      void window.routine.read(changed, pathRef.current).then((text) => {
        if (text === contentRef.current) return
        contentRef.current = text
        setInitial(text)
        setChars(text.replace(/\s/g, '').length)
        setLoadToken((token) => token + 1)
      }).catch(async (error: unknown) => {
        const message = error instanceof Error ? error.message : ''
        const secret = secretRef.current
        const rel = pathRef.current
        if (message === 'This note is encrypted' && secret && rel && secret.path === rel && secret.zone === zoneRef.current) {
          try {
            const text = await window.routine.unseal(secret.zone, rel, secret.password)
            if (text === contentRef.current) return
            contentRef.current = text
            setInitial(text)
            setChars(text.replace(/\s/g, '').length)
            setLoadToken((token) => token + 1)
          } catch {
            return
          }
          return
        }
        if (message === 'This note is encrypted') return
        pathRef.current = null
        setOpenPath(null)
      })
    })
  }, [refresh])

  useEffect(() => {
    return window.routine.onFlush(() => {
      void saveCurrent().finally(() => window.routine.flushDone())
    })
  }, [saveCurrent])

  useEffect(() => {
    if (saveState !== 'dirty') return
    const timer = window.setTimeout(() => {
      void saveCurrent().catch((error: unknown) => {
        showToast(error instanceof Error ? error.message : 'Could not save')
        setSaveState('dirty')
      })
    }, 480)
    return () => window.clearTimeout(timer)
  }, [saveState, loadToken, saveCurrent, showToast])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const meta = event.ctrlKey || event.metaKey
      if (meta && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      } else if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveCurrent()
      } else if (meta && event.key === '\\') {
        event.preventDefault()
        setTreeOpen((open) => !open)
      } else if (meta && event.shiftKey && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        setDrawerOpen((open) => !open)
      } else if (meta && event.key === ',') {
        event.preventDefault()
        setSettingsOpen(true)
      } else if (meta && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        void createFile('', 'Untitled.md')
      } else if (event.key === 'Escape') {
        setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function switchZone(next: Zone): Promise<void> {
    if (next === zone || switching) return
    setSwitching(true)
    try {
      await saveCurrent()
      await wait(160)
      paintZone(next)
      setTrashOpen(false)
      await refresh(next)
      const sample = next === 'note' ? 'Note_sample.md' : 'Routine_sample.md'
      const rel = settings?.lastOpen[next] ?? sample
      try {
        await openFile(next, rel)
      } catch {
        pathRef.current = null
        contentRef.current = ''
        setOpenPath(null)
        setInitial('')
        setChars(0)
      }
    } finally {
      window.setTimeout(() => setSwitching(false), 220)
    }
  }

  async function createFile(parent: string, name: string): Promise<void> {
    const rel = joinRel(parent, name.endsWith('.md') ? name : `${name}.md`)
    if (!rel) return
    try {
      await window.routine.write(zone, rel, '')
      await refresh(zone)
      await openFile(zone, rel)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not create the note')
    }
  }

  async function createFolder(parent: string, name: string): Promise<void> {
    const rel = joinRel(parent, name)
    if (!rel) return
    try {
      await window.routine.createFolder(zone, rel)
      await refresh(zone)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not create the folder')
    }
  }

  async function rename(path: string, name: string): Promise<void> {
    const next = joinRel(parentPath(path), name)
    if (!next || next === path) return
    try {
      await saveCurrent()
      await window.routine.move(zone, path, next)
      if (pathRef.current === path || pathRef.current?.startsWith(`${path}/`)) {
        const updated = pathRef.current === path ? next : `${next}${pathRef.current.slice(path.length)}`
        setInitial(contentRef.current)
        pathRef.current = updated
        setOpenPath(updated)
        await window.routine.remember(zone, updated)
      }
      await refresh(zone)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not rename')
    }
  }

  async function remove(path: string): Promise<void> {
    try {
      if (pathRef.current === path) await saveCurrent()
      await window.routine.remove(zone, path)
      if (pathRef.current === path || pathRef.current?.startsWith(`${path}/`)) {
        pathRef.current = null
        contentRef.current = ''
        dirtyRef.current = false
        setOpenPath(null)
        setInitial('')
      }
      await refresh(zone)
      showToast('Moved to trash')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not delete')
    }
  }

  async function move(from: string, folder: string): Promise<void> {
    const name = from.split('/').pop()
    if (!name) return
    const dest = joinRel(folder, name)
    if (!dest || dest === from) return
    await renamePath(from, dest)
  }

  async function renamePath(from: string, dest: string): Promise<void> {
    try {
      await saveCurrent()
      await window.routine.move(zone, from, dest)
      if (pathRef.current === from) {
        setInitial(contentRef.current)
        pathRef.current = dest
        setOpenPath(dest)
        await window.routine.remember(zone, dest)
      }
      await refresh(zone)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not move')
    }
  }

  if (booting || !settings) return <div className="boot" />
  if (!settings.vaultRoot) {
    return (
      <div className="app" data-zone={zone}>
        <header className="titlebar">
          <span />
          <span />
          <div className="titlebar-group right">
            <button className="win-btn" onClick={() => void window.routine.minimize()} aria-label="Minimize">–</button>
            <button className="win-btn" onClick={() => void window.routine.maximize()} aria-label="Maximize">□</button>
            <button className="win-btn close" onClick={() => void window.routine.close()} aria-label="Close">×</button>
          </div>
        </header>
        <Welcome settings={settings} onReady={(next) => void adoptVault(next)} onToast={showToast} />
        {toast ? <div className="toast">{toast}</div> : null}
      </div>
    )
  }

  const label = saveState === 'saving' ? 'Saving' : saveState === 'dirty' ? 'Unsaved' : 'Saved'

  return (
    <div className={`app${treeOpen ? '' : ' tree-closed'}${drawerOpen ? ' drawer-open' : ''}${switching ? ' switching' : ''}`} data-zone={zone}>
      <TitleBar
        zone={zone}
        treeOpen={treeOpen}
        drawerOpen={drawerOpen}
        onToggleTree={() => setTreeOpen((open) => !open)}
        onSearch={() => setSearchOpen(true)}
        onToggleDrawer={() => setDrawerOpen((open) => !open)}
        onSettings={() => setSettingsOpen(true)}
        onZone={(next) => void switchZone(next)}
      />
      <div className="workspace">
        <div className="tree-slot" style={{ width: treeOpen ? treeWidth : 0 }}>
          {trashOpen ? (
            <TrashPanel
              items={trash}
              onBack={() => setTrashOpen(false)}
              onRestore={(id) => void restore(id)}
              onEmpty={() => void clearTrash()}
            />
          ) : (
            <FileTree
              tree={tree}
              openPath={openPath}
              onOpen={(path) => void openFile(zone, path).catch((error: unknown) => showToast(messageOf(error)))}
              onCreateFile={(parent, name) => void createFile(parent, name)}
              onCreateFolder={(parent, name) => void createFolder(parent, name)}
              onRename={(path, name) => void rename(path, name)}
              onDelete={(path) => void remove(path)}
              onMove={(from, folder) => void move(from, folder)}
              onReveal={(path) => void reveal(path)}
              onCopyPath={(path, kind) => void copyPath(path, kind)}
              onCopyEntry={(path) => void copyEntry(path)}
              onPaste={() => void pasteHere()}
              onOpenRoot={() => void openRoot()}
              onEncrypt={(path) => {
                setGateError('')
                setGate({ mode: 'encrypt', zone, path })
              }}
              onDecrypt={(path) => {
                setGateError('')
                setGate({ mode: 'decrypt', zone, path })
              }}
              canPaste={() => window.routine.canPaste()}
              onTrash={() => {
                setTrashOpen(true)
                void refresh(zone)
              }}
            />
          )}
          {treeOpen ? (
            <div
              className="tree-resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize files"
              onPointerDown={(event) => {
                event.preventDefault()
                const handle = event.currentTarget
                handle.setPointerCapture(event.pointerId)
                const startX = event.clientX
                const startW = treeWidthRef.current
                document.body.classList.add('tree-resizing')
                const move = (ev: PointerEvent): void => {
                  const next = Math.min(TREE_MAX, Math.max(TREE_MIN, startW + ev.clientX - startX))
                  treeWidthRef.current = next
                  setTreeWidth(next)
                }
                const up = (ev: PointerEvent): void => {
                  handle.removeEventListener('pointermove', move)
                  handle.removeEventListener('pointerup', up)
                  document.body.classList.remove('tree-resizing')
                  localStorage.setItem(TREE_WIDTH_KEY, String(treeWidthRef.current))
                  if (handle.hasPointerCapture(ev.pointerId)) handle.releasePointerCapture(ev.pointerId)
                }
                handle.addEventListener('pointermove', move)
                handle.addEventListener('pointerup', up)
              }}
            />
          ) : null}
        </div>
        <main className="stage">
          <div className="editor-stage">
            {openPath ? (
              <EditorPane
                key={`${zone}:${openPath}`}
                zone={zone}
                filePath={openPath}
                loadToken={loadToken}
                initialContent={initial}
                handbook={settings.handbook}
                shortcuts={settings.shortcuts}
                onChange={(value) => {
                  if (value === contentRef.current) return
                  contentRef.current = value
                  dirtyRef.current = true
                  setChars(value.replace(/\s/g, '').length)
                  setSaveState('dirty')
                }}
              />
            ) : (
              <div className="empty-note">
                <p>{zone === 'note' ? 'Write tonight’s diary' : 'Note what you did today'}</p>
                <button className="primary" onClick={() => void createFile('', 'Untitled.md')}>
                  New note
                </button>
              </div>
            )}
          </div>
          <footer className="status">
            <span>{openPath ?? (zone === 'note' ? 'Note' : 'Routine')}</span>
            <span>{label}</span>
            <span>{chars} chars</span>
          </footer>
        </main>
        <div className="drawer-slot">
          <AiDrawer
            zone={zone}
            profiles={settings.profiles}
            activeProfileId={settings.activeProfileId}
            systemPrompt={settings.systemPrompt}
            onToast={showToast}
            onProfile={(id) => void activateProfile(id)}
          />
        </div>
      </div>
      {searchOpen ? (
        <SearchModal
          zone={zone}
          onClose={() => setSearchOpen(false)}
          onOpen={(path) => void openFile(zone, path).catch((error: unknown) => showToast(messageOf(error)))}
        />
      ) : null}
      {settingsOpen ? (
        <SettingsModal
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onToast={showToast}
          onSaved={(next) => {
            setSettings(withEditor(next))
            if (next.vaultRoot && next.vaultRoot !== settings.vaultRoot) void adoptVault(next)
          }}
          onCheckUpdates={() => void checkForUpdates()}
        />
      ) : null}
      {toast ? <div className="toast">{toast}</div> : null}
      {update ? (
        <UpdateNotice
          phase={update.phase}
          version={update.version}
          notes={update.notes}
          percent={update.percent}
          onLater={() => setUpdate(null)}
          onDownload={() => void window.routine.downloadUpdate().catch((error: unknown) => showToast(messageOf(error)))}
          onInstall={() => void window.routine.installUpdate()}
        />
      ) : null}
      {gate ? (
        <PasswordDialog
          mode={gate.mode}
          error={gateError}
          onCancel={() => {
            setGate(null)
            setGateError('')
          }}
          onSubmit={(password) => void submitGate(password)}
        />
      ) : null}
    </div>
  )

  async function adoptVault(next: PublicSettings): Promise<void> {
    setSettings(withEditor(next))
    paintZone(next.lastZone)
    if (!next.vaultRoot) return
    await refresh(next.lastZone)
    const sample = next.lastZone === 'note' ? 'Note_sample.md' : 'Routine_sample.md'
    try {
      await openFile(next.lastZone, next.lastOpen[next.lastZone] ?? sample)
    } catch {
      pathRef.current = null
      setOpenPath(null)
    }
  }

  async function activateProfile(id: string): Promise<void> {
    if (!settings) return
    const next = await window.routine.saveProfiles(
      settings.profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        baseURL: profile.baseURL,
        model: profile.model,
        apiKey: '',
        keepKey: true
      })),
      id,
      settings.systemPrompt
    )
    setSettings(withEditor(next))
  }

  async function restore(id: string): Promise<void> {
    try {
      const rel = await window.routine.restore(zone, id)
      await refresh(zone)
      await openFile(zone, rel)
      showToast('Restored')
    } catch (error) {
      showToast(messageOf(error))
    }
  }

  async function reveal(path: string): Promise<void> {
    try {
      await window.routine.reveal(zone, path)
    } catch (error) {
      showToast(messageOf(error))
    }
  }

  async function copyPath(path: string, kind: 'absolute' | 'relative'): Promise<void> {
    try {
      await window.routine.copyPath(zone, path, kind)
      showToast(kind === 'absolute' ? 'Absolute path copied' : 'Relative path copied')
    } catch (error) {
      showToast(messageOf(error))
    }
  }

  async function copyEntry(path: string): Promise<void> {
    try {
      await window.routine.copyEntry(zone, path)
      showToast('Copied')
    } catch (error) {
      showToast(messageOf(error))
    }
  }

  async function pasteHere(): Promise<void> {
    try {
      await window.routine.paste(zone, '')
      await refresh(zone)
      showToast('Pasted')
    } catch (error) {
      showToast(messageOf(error))
    }
  }

  async function openRoot(): Promise<void> {
    try {
      await window.routine.openRoot(zone)
    } catch (error) {
      showToast(messageOf(error))
    }
  }

  async function checkForUpdates(): Promise<void> {
    const result = await window.routine.checkUpdates(false)
    if (!result.packaged) showToast('Updates apply to the installed app.')
  }

  async function submitGate(password: string): Promise<void> {
    if (!gate) return
    try {
      if (gate.mode === 'encrypt') {
        if (pathRef.current === gate.path && zoneRef.current === gate.zone && dirtyRef.current) await saveCurrent()
        await window.routine.seal(gate.zone, gate.path, password)
        if (pathRef.current === gate.path && zoneRef.current === gate.zone) {
          await holdSecret({ zone: gate.zone, path: gate.path, password })
        }
        setGate(null)
        setGateError('')
        await refresh(gate.zone)
        return
      }
      if (gate.mode === 'decrypt') {
        if (pathRef.current === gate.path && zoneRef.current === gate.zone && dirtyRef.current) await saveCurrent()
        const plain = await window.routine.release(gate.zone, gate.path, password)
        if (pathRef.current === gate.path && zoneRef.current === gate.zone) {
          await holdSecret(null)
          contentRef.current = plain
          dirtyRef.current = false
          setInitial(plain)
          setChars(plain.replace(/\s/g, '').length)
          setLoadToken((token) => token + 1)
          setSaveState('saved')
        } else {
          await applyNote(gate.zone, gate.path, plain, null)
        }
        setGate(null)
        setGateError('')
        await refresh(gate.zone)
        return
      }
      await applyNote(gate.zone, gate.path, await window.routine.unseal(gate.zone, gate.path, password), password)
    } catch (error) {
      setGateError(messageOf(error))
    }
  }

  async function clearTrash(): Promise<void> {
    await window.routine.emptyTrash(zone)
    setTrash([])
    showToast('Trash emptied')
  }
}

function joinRel(parent: string, name: string): string | null {
  const clean = name.replace(/[\\/]/g, '').trim()
  if (!clean || clean === '.' || clean === '..') return null
  return parent ? `${parent}/${clean}` : clean
}

function parentPath(path: string): string {
  const index = path.lastIndexOf('/')
  return index < 0 ? '' : path.slice(0, index)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function withEditor(settings: PublicSettings): PublicSettings {
  return {
    ...settings,
    handbook: coerceHandbook(settings.handbook),
    shortcuts: coerceShortcuts(settings.shortcuts),
    editorFont: coerceEditorFont(settings.editorFont)
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}
