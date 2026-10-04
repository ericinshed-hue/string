import type { ChatEvent, StoredMessage, TreeNode, Zone } from '../shared/types'
import { toolLabel } from '../shared/chat'
import { invalidateSearch, searchNotes } from './search'
import { grantedPassword, revokeSecret } from './grants'
import { deleteToTrash, listTrash, listTree, noteIsSealed, openNote, readNote, restoreTrash, writeNote, writeSealedNote } from './vault'

type ToolCall = { id: string; name: string; arguments: string }

type RunOptions = {
  zone: Zone
  sessionId: string
  vaultRoot: string
  baseURL: string
  apiKey: string
  model: string
  systemPrompt: string
  history: StoredMessage[]
  userText: string
  userDisplay?: string
  signal: AbortSignal
  onEvent: (event: ChatEvent) => void
  onFilesChanged: () => void
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List notes in the current zone. path is relative; an empty string is the zone root.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read one Markdown file in the current zone. path is relative. An encrypted note returns its text only while the user has it unlocked in the editor. Otherwise say it is encrypted. Never ask for or accept a password.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search file names and contents in the current zone.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a Markdown file in the current zone. An unlocked encrypted note stays encrypted. A locked note cannot be overwritten.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Move a note or folder in the current zone to the trash.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_trash',
      description: 'List trash items and their ids in the current zone.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'restore_file',
      description: 'Restore a file by its trash id.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      }
    }
  }
]

function endpoint(baseURL: string): string {
  const trimmed = baseURL.trim().replace(/\/+$/, '')
  if (trimmed.endsWith('/chat/completions')) return trimmed
  return `${trimmed}/chat/completions`
}

function clip(text: string, max = 12000): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n… (truncated)`
}

function parseArgs(raw: string): Record<string, string> {
  try {
    const value = JSON.parse(raw || '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item ?? '')]))
  } catch {
    return {}
  }
}

async function readForAgent(vaultRoot: string, zone: Zone, rel: string): Promise<string> {
  if (!(await noteIsSealed(vaultRoot, zone, rel))) return readNote(vaultRoot, zone, rel)
  const password = grantedPassword(zone, rel)
  if (!password) return 'This note is encrypted'
  try {
    return await openNote(vaultRoot, zone, rel, password)
  } catch {
    revokeSecret(zone, rel)
    return 'This note is encrypted'
  }
}

async function execTool(options: RunOptions, call: ToolCall): Promise<string> {
  const { zone, vaultRoot } = options
  const args = parseArgs(call.arguments)
  try {
    switch (call.name) {
      case 'list_files': {
        const tree = await listTree(vaultRoot, zone)
        const rel = (args.path ?? '').replace(/^\.\/?/, '').replace(/^\/+/, '')
        const nodes = rel ? findChildren(tree, rel) : tree
        if (!nodes) return 'Error: folder not found'
        return clip(JSON.stringify(nodes.map((node) => ({ name: node.name, path: node.path, type: node.type }))))
      }
      case 'read_file':
        return clip(await readForAgent(vaultRoot, zone, args.path ?? ''))
      case 'search_files':
        return clip(JSON.stringify(await searchNotes(vaultRoot, zone, args.query ?? '')))
      case 'write_file': {
        const rel = args.path ?? ''
        if (await noteIsSealed(vaultRoot, zone, rel)) {
          const password = grantedPassword(zone, rel)
          if (!password) return 'Error: This note is encrypted'
          await writeSealedNote(vaultRoot, zone, rel, args.content ?? '', password)
        } else {
          await writeNote(vaultRoot, zone, rel, args.content ?? '')
        }
        invalidateSearch(zone)
        options.onFilesChanged()
        return `Wrote ${rel}`
      }
      case 'delete_file': {
        const item = await deleteToTrash(vaultRoot, zone, args.path ?? '')
        invalidateSearch(zone)
        options.onFilesChanged()
        return `Moved to trash ${item.id}: ${item.originalRelativePath}`
      }
      case 'list_trash':
        return clip(JSON.stringify(await listTrash(vaultRoot, zone)))
      case 'restore_file': {
        const restored = await restoreTrash(vaultRoot, zone, args.id ?? '')
        invalidateSearch(zone)
        options.onFilesChanged()
        return `Restored to ${restored}`
      }
      default:
        return `Error: unknown tool ${call.name}`
    }
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'The tool failed'}`
  }
}

function findChildren(nodes: TreeNode[], rel: string): TreeNode[] | null {
  for (const node of nodes) {
    if (node.path === rel) return node.type === 'folder' ? (node.children ?? []) : null
    if (node.children) {
      const found = findChildren(node.children, rel)
      if (found) return found
    }
  }
  return null
}

function toApi(messages: StoredMessage[]) {
  return messages.map((message) => {
    if (message.role === 'assistant' && message.toolCalls?.length) {
      return {
        role: 'assistant' as const,
        content: message.content,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function' as const,
          function: { name: call.name, arguments: call.arguments }
        }))
      }
    }
    if (message.role === 'tool') {
      return { role: 'tool' as const, content: message.content, tool_call_id: message.toolCallId }
    }
    return { role: message.role, content: message.content }
  })
}

async function streamCompletion(
  options: RunOptions,
  messages: StoredMessage[],
  onDelta: (text: string) => void
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const response = await fetch(endpoint(options.baseURL), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: options.model,
      messages: [
        {
          role: 'system',
          content: `${options.systemPrompt}\n\nCurrent zone: ${options.zone === 'note' ? 'Note (night diary)' : 'Routine (day log)'}. Every path is relative to this zone. Encrypted notes are readable only while the user has them unlocked. If a tool says a note is encrypted, do not ask for the password and do not invent its contents.`
        },
        ...toApi(messages)
      ],
      tools: TOOLS,
      stream: true
    }),
    signal: options.signal
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`The model returned ${response.status}: ${text.slice(0, 280)}`)
  }
  if (!response.body) throw new Error('The model returned an empty response')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  const calls = new Map<number, ToolCall>()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (!data || data === '[DONE]') continue
      let json: { choices?: Array<{ delta?: { content?: string; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> } }> }
      try {
        json = JSON.parse(data)
      } catch {
        continue
      }
      const delta = json.choices?.[0]?.delta
      if (delta?.content) {
        content += delta.content
        onDelta(delta.content)
      }
      for (const part of delta?.tool_calls ?? []) {
        const index = part.index ?? 0
        const current = calls.get(index) ?? { id: '', name: '', arguments: '' }
        if (part.id) current.id = part.id
        if (part.function?.name) current.name += part.function.name
        if (part.function?.arguments) current.arguments += part.function.arguments
        calls.set(index, current)
      }
    }
  }
  const toolCalls = [...calls.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, call], index) => ({ ...call, id: call.id || `call-${index}` }))
  return { content, toolCalls }
}

export async function runAgent(options: RunOptions): Promise<StoredMessage[]> {
  const messages: StoredMessage[] = [
    ...options.history,
    { role: 'user', content: options.userText, display: options.userDisplay }
  ]
  for (let round = 0; round < 20; round++) {
    const result = await streamCompletion(options, messages, (text) => {
      options.onEvent({ type: 'delta', sessionId: options.sessionId, text })
    })
    if (result.toolCalls.length === 0) {
      messages.push({ role: 'assistant', content: result.content })
      return messages
    }
    messages.push({ role: 'assistant', content: result.content, toolCalls: result.toolCalls })
    for (const call of result.toolCalls) {
      options.onEvent({
        type: 'tool',
        sessionId: options.sessionId,
        name: toolLabel(call.name),
        status: 'start',
        detail: clip(call.arguments, 160)
      })
      const output = await execTool(options, call)
      options.onEvent({
        type: 'tool',
        sessionId: options.sessionId,
        name: toolLabel(call.name),
        status: 'done',
        detail: clip(output, 160)
      })
      messages.push({ role: 'tool', content: output, toolCallId: call.id })
    }
  }
  throw new Error('The tool-call limit was reached')
}

export const runs = new Map<string, AbortController>()
