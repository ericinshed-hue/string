import { contextBridge, ipcRenderer } from 'electron'
import type { ChatDesk, ChatEvent, HandbookRule, ProfileInput, PublicSettings, SearchHit, ShortcutBinding, TrashItem, TreeNode, UiMessage, Zone } from '../shared/types'

const api = {
  getSettings: (): Promise<PublicSettings> => ipcRenderer.invoke('settings:get'),
  pickRoot: (): Promise<PublicSettings | null> => ipcRenderer.invoke('settings:pick-root'),
  useSuggested: (): Promise<PublicSettings> => ipcRenderer.invoke('settings:use-suggested'),
  saveProfiles: (profiles: ProfileInput[], activeProfileId: string | null, systemPrompt: string): Promise<PublicSettings> =>
    ipcRenderer.invoke('settings:save-profiles', profiles, activeProfileId, systemPrompt),
  saveEditor: (handbook: HandbookRule[], shortcuts: ShortcutBinding[], editorFont: string): Promise<PublicSettings> =>
    ipcRenderer.invoke('settings:save-editor', handbook, shortcuts, editorFont),
  tree: (zone: Zone): Promise<TreeNode[]> => ipcRenderer.invoke('vault:tree', zone),
  read: (zone: Zone, rel: string): Promise<string> => ipcRenderer.invoke('vault:read', zone, rel),
  write: (zone: Zone, rel: string, content: string): Promise<void> => ipcRenderer.invoke('vault:write', zone, rel, content),
  sealed: (zone: Zone, rel: string): Promise<boolean> => ipcRenderer.invoke('vault:sealed', zone, rel),
  seal: (zone: Zone, rel: string, password: string): Promise<void> => ipcRenderer.invoke('vault:seal', zone, rel, password),
  unseal: (zone: Zone, rel: string, password: string): Promise<string> => ipcRenderer.invoke('vault:unseal', zone, rel, password),
  writeSealed: (zone: Zone, rel: string, content: string, password: string): Promise<void> =>
    ipcRenderer.invoke('vault:write-sealed', zone, rel, content, password),
  release: (zone: Zone, rel: string, password: string): Promise<string> => ipcRenderer.invoke('vault:release', zone, rel, password),
  grant: (zone: Zone, rel: string, password: string): Promise<void> => ipcRenderer.invoke('vault:grant', zone, rel, password),
  revoke: (zone: Zone, rel: string): Promise<void> => ipcRenderer.invoke('vault:revoke', zone, rel),
  createFolder: (zone: Zone, rel: string): Promise<void> => ipcRenderer.invoke('vault:create-folder', zone, rel),
  move: (zone: Zone, fromRel: string, toRel: string): Promise<void> => ipcRenderer.invoke('vault:move', zone, fromRel, toRel),
  remove: (zone: Zone, rel: string): Promise<TrashItem> => ipcRenderer.invoke('vault:delete', zone, rel),
  reveal: (zone: Zone, rel: string): Promise<void> => ipcRenderer.invoke('vault:reveal', zone, rel),
  openRoot: (zone: Zone): Promise<void> => ipcRenderer.invoke('vault:open-root', zone),
  copyPath: (zone: Zone, rel: string, kind: 'absolute' | 'relative'): Promise<void> =>
    ipcRenderer.invoke('vault:copy-path', zone, rel, kind),
  copyEntry: (zone: Zone, rel: string): Promise<void> => ipcRenderer.invoke('vault:copy-entry', zone, rel),
  canPaste: (): Promise<boolean> => ipcRenderer.invoke('vault:can-paste'),
  paste: (zone: Zone, parentRel: string): Promise<void> => ipcRenderer.invoke('vault:paste', zone, parentRel),
  trash: (zone: Zone): Promise<TrashItem[]> => ipcRenderer.invoke('vault:trash', zone),
  restore: (zone: Zone, id: string): Promise<string> => ipcRenderer.invoke('vault:restore', zone, id),
  emptyTrash: (zone: Zone): Promise<void> => ipcRenderer.invoke('vault:empty-trash', zone),
  remember: (zone: Zone, rel: string | null): Promise<void> => ipcRenderer.invoke('vault:remember', zone, rel),
  saveImage: (zone: Zone, noteRel: string, filename: string, bytes: Uint8Array): Promise<string> =>
    ipcRenderer.invoke('vault:save-image', zone, noteRel, filename, bytes),
  search: (zone: Zone, query: string): Promise<SearchHit[]> => ipcRenderer.invoke('vault:search', zone, query),
  rewatch: (): void => ipcRenderer.send('vault:rewatch'),
  chatDesk: (zone: Zone): Promise<ChatDesk> => ipcRenderer.invoke('chat:desk', zone),
  chatCreate: (zone: Zone): Promise<ChatDesk> => ipcRenderer.invoke('chat:create', zone),
  chatOpen: (zone: Zone, id: string): Promise<ChatDesk> => ipcRenderer.invoke('chat:open', zone, id),
  chatRemove: (zone: Zone, id: string): Promise<ChatDesk> => ipcRenderer.invoke('chat:remove', zone, id),
  chatSend: (zone: Zone, sessionId: string, text: string): Promise<UiMessage[]> =>
    ipcRenderer.invoke('chat:send', zone, sessionId, text),
  chatStop: (zone: Zone, sessionId: string): Promise<void> => ipcRenderer.invoke('chat:stop', zone, sessionId),
  onChat: (listener: (zone: Zone, event: ChatEvent) => void): (() => void) => {
    const wrapped = (_event: unknown, zone: Zone, event: ChatEvent): void => listener(zone, event)
    ipcRenderer.on('chat:event', wrapped)
    return () => ipcRenderer.removeListener('chat:event', wrapped)
  },
  onVaultChanged: (listener: (zone: Zone) => void): (() => void) => {
    const wrapped = (_event: unknown, zone: Zone): void => listener(zone)
    ipcRenderer.on('vault:changed', wrapped)
    return () => ipcRenderer.removeListener('vault:changed', wrapped)
  },
  onFlush: (listener: () => void): (() => void) => {
    const wrapped = (): void => listener()
    ipcRenderer.on('app:flush', wrapped)
    return () => ipcRenderer.removeListener('app:flush', wrapped)
  },
  flushDone: (): void => ipcRenderer.send('app:flush-done'),
  minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  maximize: (): Promise<void> => ipcRenderer.invoke('window:maximize'),
  close: (): Promise<void> => ipcRenderer.invoke('window:close'),
  setBackground: (color: string): Promise<void> => ipcRenderer.invoke('window:background', color),
  checkUpdates: (quiet: boolean): Promise<{ packaged: boolean; version: string }> => ipcRenderer.invoke('updater:check', quiet),
  downloadUpdate: (): Promise<void> => ipcRenderer.invoke('updater:download'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('updater:install'),
  onUpdate: (listener: (status: UpdateStatus) => void): (() => void) => {
    const wrapped = (_event: unknown, status: UpdateStatus): void => listener(status)
    ipcRenderer.on('updater:status', wrapped)
    return () => ipcRenderer.removeListener('updater:status', wrapped)
  }
}

type UpdateStatus =
  | { type: 'available'; version: string; notes: string }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'none'; version: string }
  | { type: 'error'; message: string }

export type RoutineApi = typeof api

contextBridge.exposeInMainWorld('routine', api)
