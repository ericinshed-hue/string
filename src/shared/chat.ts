import type { StoredMessage, ToolStep, UiMessage } from './types'

export function projectChat(messages: StoredMessage[]): UiMessage[] {
  const ui: UiMessage[] = []
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]
    if (message.role === 'user') {
      ui.push({ id: `u-${i}`, role: 'user', content: message.display ?? message.content, tools: [] })
      continue
    }
    if (message.role !== 'assistant') continue
    const tools: ToolStep[] = []
    const calls = message.toolCalls ?? []
    let cursor = i + 1
    for (const call of calls) {
      const toolMessage = messages[cursor]
      const detail =
        toolMessage && toolMessage.role === 'tool' && toolMessage.toolCallId === call.id
          ? clip(toolMessage.content)
          : clip(call.arguments)
      if (toolMessage && toolMessage.role === 'tool') cursor += 1
      tools.push({ name: toolLabel(call.name), detail, status: 'done' })
    }
    ui.push({
      id: `a-${i}`,
      role: 'assistant',
      content: message.content,
      tools
    })
  }
  return ui
}

export function toolLabel(name: string): string {
  switch (name) {
    case 'list_files':
      return 'List files'
    case 'read_file':
      return 'Read note'
    case 'search_files':
      return 'Search'
    case 'write_file':
      return 'Write note'
    case 'delete_file':
      return 'Move to trash'
    case 'list_trash':
      return 'List trash'
    case 'restore_file':
      return 'Restore note'
    default:
      return name
  }
}

function clip(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > 140 ? `${oneLine.slice(0, 140)}…` : oneLine
}
