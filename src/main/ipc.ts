import { dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import type { ChatEvent, HandbookRule, ProfileInput, ShortcutBinding, Zone } from '../shared/types'
import { projectChat } from '../shared/chat'
import { runAgent, runs } from './agent'
import { createSession, loadDesk, openSession, readSession, removeSession, writeSession } from './history'
import { canPasteFiles, copyFiles, copyText, filesToPaste } from './fileclip'
import { grantSecret, revokeSecret } from './grants'
import { invalidateSearch, searchNotes } from './search'
import {
  activeProfile,
  currentVault,
  publicSettings,
  saveEditorSettings,
  saveProfileSettings,
  setLastOpen,
  setVaultRoot,
  suggestVault
} from './settings'
import {
  absoluteNotePath,
  createFolder,
  deleteToTrash,
  emptyTrash,
  ensureZoneDirs,
  listTrash,
  listTree,
  moveNote,
  noteIsSealed,
  openNote,
  pasteEntries,
  readNote,
  releaseNote,
  restoreTrash,
  saveImage,
  sealNote,
  writeNote,
  writeSealedNote,
  zoneDirectory
} from './vault'

function isZone(value: unknown): value is Zone {
  return value === 'note' || value === 'routine'
}

async function requireVault(): Promise<string> {
  const root = await currentVault()
  if (!root) throw new Error('No vault selected')
  await ensureZoneDirs(root)
  return root
}

export function registerIpc(win: BrowserWindow): void {
  ipcMain.handle('settings:get', () => publicSettings())

  ipcMain.handle('settings:pick-root', async () => {
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    const root = result.filePaths[0]
    const stat = await fs.stat(root)
    if (!stat.isDirectory()) throw new Error('Choose a folder')
    await setVaultRoot(root)
    await ensureZoneDirs(root)
    invalidateSearch()
    return publicSettings()
  })

  ipcMain.handle('settings:use-suggested', async () => {
    const suggested = suggestVault()
    if (!suggested) throw new Error('Sample vault Routine_Note was not found')
    await setVaultRoot(suggested)
    await ensureZoneDirs(suggested)
    invalidateSearch()
    return publicSettings()
  })

  ipcMain.handle(
    'settings:save-profiles',
    async (_event, profiles: ProfileInput[], activeProfileId: string | null, systemPrompt: string) => {
      await saveProfileSettings(profiles, activeProfileId, systemPrompt)
      return publicSettings()
    }
  )

  ipcMain.handle(
    'settings:save-editor',
    async (_event, handbook: HandbookRule[], shortcuts: ShortcutBinding[], editorFont: string) => {
      await saveEditorSettings(handbook, shortcuts, editorFont)
      return publicSettings()
    }
  )

  ipcMain.handle('vault:tree', async (_event, zone: Zone) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    return listTree(await requireVault(), zone)
  })

  ipcMain.handle('vault:read', async (_event, zone: Zone, rel: string) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    return readNote(await requireVault(), zone, rel)
  })

  ipcMain.handle('vault:write', async (_event, zone: Zone, rel: string, content: string) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    const root = await requireVault()
    await writeNote(root, zone, rel, content)
    invalidateSearch(zone)
  })

  ipcMain.handle('vault:sealed', async (_event, zone: Zone, rel: string) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    return noteIsSealed(await requireVault(), zone, rel)
  })

  ipcMain.handle('vault:seal', async (_event, zone: Zone, rel: string, password: string) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    await sealNote(await requireVault(), zone, rel, password)
    invalidateSearch(zone)
  })

  ipcMain.handle('vault:unseal', async (_event, zone: Zone, rel: string, password: string) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    return openNote(await requireVault(), zone, rel, password)
  })

  ipcMain.handle('vault:write-sealed', async (_event, zone: Zone, rel: string, content: string, password: string) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    await writeSealedNote(await requireVault(), zone, rel, content, password)
    invalidateSearch(zone)
  })

  ipcMain.handle('vault:grant', (_event, zone: Zone, rel: string, password: string) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    grantSecret(zone, rel, password)
  })

  ipcMain.handle('vault:revoke', (_event, zone: Zone, rel: string) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    revokeSecret(zone, rel)
  })

  ipcMain.handle('vault:release', async (_event, zone: Zone, rel: string, password: string) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    const plain = await releaseNote(await requireVault(), zone, rel, password)
    invalidateSearch(zone)
    return plain
  })

  ipcMain.handle('vault:create-folder', async (_event, zone: Zone, rel: string) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    await createFolder(await requireVault(), zone, rel)
  })

  ipcMain.handle('vault:move', async (_event, zone: Zone, fromRel: string, toRel: string) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    await moveNote(await requireVault(), zone, fromRel, toRel)
    invalidateSearch(zone)
  })

  ipcMain.handle('vault:delete', async (_event, zone: Zone, rel: string) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    const item = await deleteToTrash(await requireVault(), zone, rel)
    invalidateSearch(zone)
    return item
  })

  ipcMain.handle('vault:trash', async (_event, zone: Zone) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    return listTrash(await requireVault(), zone)
  })

  ipcMain.handle('vault:restore', async (_event, zone: Zone, id: string) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    const rel = await restoreTrash(await requireVault(), zone, id)
    invalidateSearch(zone)
    return rel
  })

  ipcMain.handle('vault:empty-trash', async (_event, zone: Zone) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    await emptyTrash(await requireVault(), zone)
  })

  ipcMain.handle('vault:remember', async (_event, zone: Zone, rel: string | null) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    await setLastOpen(zone, rel)
  })

  ipcMain.handle(
    'vault:save-image',
    async (_event, zone: Zone, noteRel: string, filename: string, bytes: Uint8Array) => {
      if (!isZone(zone)) throw new Error('Invalid zone')
      return saveImage(await requireVault(), zone, noteRel, filename, Buffer.from(bytes))
    }
  )

  ipcMain.handle('vault:reveal', async (_event, zone: Zone, rel: string) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    const abs = await absoluteNotePath(await requireVault(), zone, rel)
    shell.showItemInFolder(abs)
  })

  ipcMain.handle('vault:open-root', async (_event, zone: Zone) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    const root = await zoneDirectory(await requireVault(), zone)
    const error = await shell.openPath(root)
    if (error) throw new Error(error)
  })

  ipcMain.handle('vault:copy-path', async (_event, zone: Zone, rel: string, kind: 'absolute' | 'relative') => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    const abs = await absoluteNotePath(await requireVault(), zone, rel)
    copyText(kind === 'absolute' ? abs : rel)
  })

  ipcMain.handle('vault:copy-entry', async (_event, zone: Zone, rel: string) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    const abs = await absoluteNotePath(await requireVault(), zone, rel)
    await copyFiles([abs])
  })

  ipcMain.handle('vault:can-paste', () => canPasteFiles())

  ipcMain.handle('vault:paste', async (_event, zone: Zone, parentRel: string) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    const root = await requireVault()
    await pasteEntries(root, zone, parentRel, filesToPaste())
    invalidateSearch(zone)
  })

  ipcMain.handle('vault:search', async (_event, zone: Zone, query: string) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    return searchNotes(await requireVault(), zone, query)
  })

  ipcMain.handle('chat:desk', async (_event, zone: Zone) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    return loadDesk(zone)
  })

  ipcMain.handle('chat:create', async (_event, zone: Zone) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    return createSession(zone)
  })

  ipcMain.handle('chat:open', async (_event, zone: Zone, id: string) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    return openSession(zone, id)
  })

  ipcMain.handle('chat:remove', async (_event, zone: Zone, id: string) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    runs.get(id)?.abort()
    runs.delete(id)
    return removeSession(zone, id)
  })

  ipcMain.handle('chat:stop', (_event, _zone: Zone, id: string) => {
    runs.get(id)?.abort()
  })

  ipcMain.handle('chat:send', async (_event, zone: Zone, sessionId: string, text: string) => {
    if (!isZone(zone)) throw new Error('Invalid zone')
    const trimmed = text.trim()
    if (!trimmed) throw new Error('Enter a message')
    if (runs.has(sessionId)) throw new Error('This chat is still replying')
    const profile = await activeProfile()
    if (!profile?.apiKey || !profile.baseURL || !profile.model) {
      throw new Error('Add an API URL, key, and model in Settings')
    }
    const vaultRoot = await requireVault()
    const history = await readSession(zone, sessionId)
    const controller = new AbortController()
    runs.set(sessionId, controller)
    const emit = (event: ChatEvent): void => {
      if (!win.isDestroyed()) win.webContents.send('chat:event', zone, event)
    }
    try {
      const messages = await runAgent({
        zone,
        sessionId,
        vaultRoot,
        baseURL: profile.baseURL,
        apiKey: profile.apiKey,
        model: profile.model,
        systemPrompt: profile.systemPrompt,
        history,
        userText: trimmed,
        signal: controller.signal,
        onEvent: emit,
        onFilesChanged: () => {
          if (!win.isDestroyed()) win.webContents.send('vault:changed', zone)
        }
      })
      await writeSession(zone, sessionId, messages)
      const view = projectChat(messages)
      emit({ type: 'done', sessionId, messages: view })
      return view
    } catch (error) {
      const aborted = controller.signal.aborted
      const message = aborted ? 'Stopped' : error instanceof Error ? error.message : 'Reply failed'
      const stored = await readSession(zone, sessionId).catch(() => [])
      const next = [...stored, { role: 'user' as const, content: trimmed }]
      next.push({ role: 'assistant' as const, content: aborted ? 'Stopped' : message })
      await writeSession(zone, sessionId, next)
      const view = projectChat(next)
      if (!win.isDestroyed()) {
        win.webContents.send('chat:event', zone, aborted ? { type: 'done', sessionId, messages: view } : { type: 'error', sessionId, message })
      }
      return view
    } finally {
      runs.delete(sessionId)
    }
  })

  ipcMain.handle('window:minimize', () => win.minimize())
  ipcMain.handle('window:maximize', () => {
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.handle('window:background', (_event, color: string) => {
    if (/^#[0-9a-fA-F]{6}$/.test(color)) win.setBackgroundColor(color)
  })
}
