export type Zone = 'note' | 'routine'

export type TreeNode = {
  name: string
  path: string
  type: 'file' | 'folder'
  encrypted?: boolean
  children?: TreeNode[]
}

export type TrashItem = {
  id: string
  name: string
  originalRelativePath: string
  deletedAt: string
  kind: 'file' | 'folder'
}

export type SearchHit = {
  path: string
  name: string
  line: number
  snippet: string
  kind: 'name' | 'content'
}

export type ProfileInput = {
  id: string
  name: string
  baseURL: string
  model: string
  apiKey: string
  keepKey: boolean
}

export type PublicProfile = {
  id: string
  name: string
  baseURL: string
  model: string
  hasKey: boolean
  keyHint: string
}

export type HandbookKind = 'time' | 'date' | 'text'

export type HandbookRule = {
  id: string
  trigger: string
  kind: HandbookKind
  format: string
  enabled: boolean
}

export type ShortcutAction = 'bold' | 'italic' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

export type ShortcutBinding = {
  action: ShortcutAction
  chord: string
}

export type Skill = {
  id: string
  name: string
  instructions: string
}

export type PublicSettings = {
  vaultRoot: string | null
  suggestedVault: string | null
  activeProfileId: string | null
  profiles: PublicProfile[]
  systemPrompt: string
  handbook: HandbookRule[]
  shortcuts: ShortcutBinding[]
  editorFont: string
  skills: Skill[]
  activated: boolean
  lastOpen: Record<Zone, string | null>
  lastZone: Zone
}

export type ToolStep = {
  name: string
  detail: string
  status: 'start' | 'done'
}

export type UiMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  tools: ToolStep[]
}

export type ChatEvent =
  | { type: 'delta'; sessionId: string; text: string }
  | { type: 'tool'; sessionId: string; name: string; status: 'start' | 'done'; detail: string }
  | { type: 'done'; sessionId: string; messages: UiMessage[] }
  | { type: 'error'; sessionId: string; message: string }

export type ChatSessionInfo = {
  id: string
  title: string
  updatedAt: string
}

export type ChatDesk = {
  activeId: string
  sessions: ChatSessionInfo[]
  messages: UiMessage[]
}

export type StoredToolCall = {
  id: string
  name: string
  arguments: string
}

export type StoredMessage = {
  role: 'user' | 'assistant' | 'tool'
  content: string
  display?: string
  toolCalls?: StoredToolCall[]
  toolCallId?: string
}

export const DEFAULT_SYSTEM_PROMPT = `You are the assistant for this notebook and only work with Markdown in the current zone. When you need a fact, look it up with a tool instead of inventing it. You may create, overwrite, and delete notes. Deletes go to the trash and can be restored. Answer in the user's language, briefly and clearly.`

export const ZONE_FOLDER: Record<Zone, 'Note' | 'Routine'> = {
  note: 'Note',
  routine: 'Routine'
}
