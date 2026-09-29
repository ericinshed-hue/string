import type { ChatDesk, ChatEvent, HandbookRule, ProfileInput, PublicSettings, SearchHit, ShortcutBinding, TrashItem, TreeNode, UiMessage, Zone } from '@shared/types'

export {}

declare global {
  interface Window {
    routine: {
      getSettings(): Promise<PublicSettings>
      pickRoot(): Promise<PublicSettings | null>
      useSuggested(): Promise<PublicSettings>
      saveProfiles(profiles: ProfileInput[], activeProfileId: string | null, systemPrompt: string): Promise<PublicSettings>
      saveEditor(handbook: HandbookRule[], shortcuts: ShortcutBinding[], editorFont: string): Promise<PublicSettings>
      tree(zone: Zone): Promise<TreeNode[]>
      read(zone: Zone, rel: string): Promise<string>
      write(zone: Zone, rel: string, content: string): Promise<void>
      sealed(zone: Zone, rel: string): Promise<boolean>
      seal(zone: Zone, rel: string, password: string): Promise<void>
      unseal(zone: Zone, rel: string, password: string): Promise<string>
      writeSealed(zone: Zone, rel: string, content: string, password: string): Promise<void>
      release(zone: Zone, rel: string, password: string): Promise<string>
      grant(zone: Zone, rel: string, password: string): Promise<void>
      revoke(zone: Zone, rel: string): Promise<void>
      createFolder(zone: Zone, rel: string): Promise<void>
      move(zone: Zone, fromRel: string, toRel: string): Promise<void>
      remove(zone: Zone, rel: string): Promise<TrashItem>
      reveal(zone: Zone, rel: string): Promise<void>
      openRoot(zone: Zone): Promise<void>
      copyPath(zone: Zone, rel: string, kind: 'absolute' | 'relative'): Promise<void>
      copyEntry(zone: Zone, rel: string): Promise<void>
      canPaste(): Promise<boolean>
      paste(zone: Zone, parentRel: string): Promise<void>
      trash(zone: Zone): Promise<TrashItem[]>
      restore(zone: Zone, id: string): Promise<string>
      emptyTrash(zone: Zone): Promise<void>
      remember(zone: Zone, rel: string | null): Promise<void>
      saveImage(zone: Zone, noteRel: string, filename: string, bytes: Uint8Array): Promise<string>
      search(zone: Zone, query: string): Promise<SearchHit[]>
      rewatch(): void
      chatDesk(zone: Zone): Promise<ChatDesk>
      chatCreate(zone: Zone): Promise<ChatDesk>
      chatOpen(zone: Zone, id: string): Promise<ChatDesk>
      chatRemove(zone: Zone, id: string): Promise<ChatDesk>
      chatSend(zone: Zone, sessionId: string, text: string): Promise<UiMessage[]>
      chatStop(zone: Zone, sessionId: string): Promise<void>
      onChat(listener: (zone: Zone, event: ChatEvent) => void): () => void
      onVaultChanged(listener: (zone: Zone) => void): () => void
      onFlush(listener: () => void): () => void
      flushDone(): void
      minimize(): Promise<void>
      maximize(): Promise<void>
      close(): Promise<void>
      setBackground(color: string): Promise<void>
      checkUpdates(quiet: boolean): Promise<{ packaged: boolean; version: string }>
      downloadUpdate(): Promise<void>
      installUpdate(): Promise<void>
      onUpdate(listener: (status: UpdateStatus) => void): () => void
    }
  }
}

type UpdateStatus =
  | { type: 'available'; version: string; notes: string }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'none'; version: string }
  | { type: 'error'; message: string }
