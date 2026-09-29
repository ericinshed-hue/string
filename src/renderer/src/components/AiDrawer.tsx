import { useEffect, useRef, useState } from 'react'
import type { ChatDesk, ChatSessionInfo, PublicProfile, ToolStep, UiMessage, Zone } from '@shared/types'
import { IconSend, IconStop } from './Icons'

type Props = {
  zone: Zone
  profiles: PublicProfile[]
  activeProfileId: string | null
  systemPrompt: string
  onProfile: (id: string) => void
  onToast: (text: string) => void
}

export function AiDrawer(props: Props) {
  const [view, setView] = useState<'chat' | 'history'>('chat')
  const [sessions, setSessions] = useState<ChatSessionInfo[]>([])
  const [activeId, setActiveId] = useState('')
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [draft, setDraft] = useState('')
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const scroller = useRef<HTMLDivElement>(null)
  const zoneRef = useRef(props.zone)
  const activeRef = useRef('')
  const liveRef = useRef<Record<string, UiMessage[]>>({})
  const drafts = useRef<Record<string, string>>({})
  zoneRef.current = props.zone
  activeRef.current = activeId

  function showDesk(desk: ChatDesk, preferLive = true): void {
    setSessions(desk.sessions)
    setActiveId(desk.activeId)
    activeRef.current = desk.activeId
    const live = liveRef.current[desk.activeId]
    setMessages(preferLive && live ? live : desk.messages)
    setDraft(drafts.current[desk.activeId] ?? '')
  }

  useEffect(() => {
    setView('chat')
    void window.routine.chatDesk(props.zone).then((desk) => showDesk(desk, true))
  }, [props.zone])

  const toastRef = useRef(props.onToast)
  toastRef.current = props.onToast

  useEffect(() => {
    return window.routine.onChat((zone, event) => {
      if (zone !== zoneRef.current) return
      const id = event.sessionId
      if (event.type === 'delta') {
        const current = liveRef.current[id] ?? []
        const next = [...current]
        const last = next[next.length - 1]
        if (!last || last.role !== 'assistant') return
        next[next.length - 1] = { ...last, content: last.content + event.text }
        liveRef.current[id] = next
        if (activeRef.current === id) setMessages(next)
      } else if (event.type === 'tool') {
        const current = liveRef.current[id] ?? []
        const next = [...current]
        const last = next[next.length - 1]
        if (!last || last.role !== 'assistant') return
        next[next.length - 1] = { ...last, tools: upsertTool(last.tools, event) }
        liveRef.current[id] = next
        if (activeRef.current === id) setMessages(next)
      } else if (event.type === 'done') {
        liveRef.current[id] = event.messages
        setBusyIds((current) => {
          const next = new Set(current)
          next.delete(id)
          return next
        })
        setSessions((current) =>
          current
            .map((session) =>
              session.id === id
                ? { ...session, title: titleFrom(event.messages), updatedAt: new Date().toISOString() }
                : session
            )
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        )
        if (activeRef.current === id) setMessages(event.messages)
      } else if (event.type === 'error') {
        setBusyIds((current) => {
          const next = new Set(current)
          next.delete(id)
          return next
        })
        if (activeRef.current === id) toastRef.current(event.message)
      }
    })
  }, [])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [messages, view, activeId])

  function rememberDraft(id: string, value: string): void {
    drafts.current[id] = value
    if (id === activeRef.current) setDraft(value)
  }

  async function createChat(): Promise<void> {
    rememberDraft(activeId, draft)
    const desk = await window.routine.chatCreate(props.zone)
    liveRef.current[desk.activeId] = []
    showDesk(desk, false)
    setView('chat')
  }

  async function openChat(id: string): Promise<void> {
    if (id === activeId && view === 'chat') return
    rememberDraft(activeId, draft)
    const desk = await window.routine.chatOpen(props.zone, id)
    showDesk(desk, true)
    setView('chat')
  }

  async function removeChat(id: string): Promise<void> {
    delete liveRef.current[id]
    delete drafts.current[id]
    const desk = await window.routine.chatRemove(props.zone, id)
    showDesk(desk, true)
  }

  async function send(): Promise<void> {
    const text = draft.trim()
    if (!text || !activeId || busyIds.has(activeId)) return
    rememberDraft(activeId, '')
    setDraft('')
    const seeded: UiMessage[] = [
      ...(liveRef.current[activeId] ?? messages),
      { id: `local-u-${Date.now()}`, role: 'user', content: text, tools: [] },
      { id: `local-a-${Date.now()}`, role: 'assistant', content: '', tools: [] }
    ]
    liveRef.current[activeId] = seeded
    setMessages(seeded)
    setBusyIds((current) => new Set(current).add(activeId))
    setSessions((current) =>
      current.map((session) => (session.id === activeId ? { ...session, title: titleFrom(seeded) } : session))
    )
    try {
      const viewMessages = await window.routine.chatSend(props.zone, activeId, text)
      liveRef.current[activeId] = viewMessages
      if (activeRef.current === activeId && zoneRef.current === props.zone) setMessages(viewMessages)
    } catch (error) {
      props.onToast(error instanceof Error ? error.message : 'Could not send')
      const rolled = seeded.slice(0, -2)
      liveRef.current[activeId] = rolled
      if (activeRef.current === activeId) setMessages(rolled)
      setBusyIds((current) => {
        const next = new Set(current)
        next.delete(activeId)
        return next
      })
    }
  }

  const busy = busyIds.has(activeId)
  const active = sessions.find((session) => session.id === activeId)

  return (
    <aside className="drawer">
      <div className="drawer-head">
        <button className={view === 'history' ? 'on' : ''} onClick={() => setView('history')}>
          History
        </button>
        <button className={view === 'chat' ? 'on' : ''} onClick={() => setView('chat')}>
          Chat
        </button>
        <select value={props.activeProfileId ?? ''} onChange={(event) => props.onProfile(event.target.value)}>
          <option value="" disabled>
            Choose a model
          </option>
          {props.profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      </div>
      <div className="chat-tabs">
        <div className="chat-tab-scroll">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={session.id === activeId ? 'chat-tab on' : 'chat-tab'}
              onClick={() => void openChat(session.id)}
              title={session.title}
            >
              {busyIds.has(session.id) ? <i className="tab-dot" /> : null}
              <span>{session.title}</span>
              <button
                className="chat-tab-close"
                aria-label="Delete chat"
                onClick={(event) => {
                  event.stopPropagation()
                  void removeChat(session.id)
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button className="chat-add" aria-label="New chat" title="New chat" onClick={() => void createChat()}>
          +
        </button>
      </div>
      {view === 'history' ? (
        <div className="drawer-log">
          <p className="tree-empty">
            {props.zone === 'note' ? 'Night' : 'Day'} chats stay here. Open one to continue.
          </p>
          {sessions.map((session) => (
            <div className={session.id === activeId ? 'history-row on' : 'history-row'} key={session.id}>
              <button onClick={() => void openChat(session.id)}>
                <strong>{session.title}</strong>
                <small>
                  {formatWhen(session.updatedAt)}
                  {busyIds.has(session.id) ? ' · Replying' : ''}
                </small>
              </button>
              <button className="history-delete" onClick={() => void removeChat(session.id)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="drawer-log" ref={scroller}>
            {messages.length === 0 ? (
              <p className="tree-empty">
                {active?.title === 'New chat' || active?.title === '新对话'
                  ? 'This is a new chat. Earlier ones are in History.'
                  : 'Ask for a summary, a follow-up, or an edit to the notes on this side.'}
              </p>
            ) : null}
            {messages.map((message) => (
              <article className={`bubble ${message.role}`} key={message.id}>
                {message.tools.map((tool, index) => (
                  <p className="tool-step" key={`${tool.name}-${index}`}>
                    {tool.status === 'start' ? 'Working' : 'Done'} · {tool.name}
                    {tool.detail ? ` · ${tool.detail}` : ''}
                  </p>
                ))}
                {message.content ? <p>{message.content}</p> : null}
              </article>
            ))}
          </div>
          <form
            className="drawer-compose"
            onSubmit={(event) => {
              event.preventDefault()
              void send()
            }}
          >
            <textarea
              value={draft}
              placeholder="Ask about the notes on this side"
              rows={3}
              onChange={(event) => {
                setDraft(event.target.value)
                if (activeId) drafts.current[activeId] = event.target.value
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void send()
                }
              }}
            />
            {busy ? (
              <button className="send-btn" type="button" title="Stop" aria-label="Stop" onClick={() => void window.routine.chatStop(props.zone, activeId)}>
                <IconStop />
              </button>
            ) : (
              <button className="send-btn primary" type="submit" title="Send" aria-label="Send">
                <IconSend />
              </button>
            )}
          </form>
        </>
      )}
    </aside>
  )
}

function titleFrom(messages: UiMessage[]): string {
  const first = messages.find((message) => message.role === 'user' && message.content.trim())
  if (!first) return 'New chat'
  const text = first.content.replace(/\s+/g, ' ').trim()
  return text.length > 22 ? `${text.slice(0, 22)}…` : text
}

function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function upsertTool(tools: ToolStep[], event: { name: string; status: 'start' | 'done'; detail: string }): ToolStep[] {
  const next = [...tools]
  const existing = [...next].reverse().find((tool) => tool.name === event.name && tool.status === 'start')
  if (event.status === 'done' && existing) {
    existing.status = 'done'
    existing.detail = event.detail
    return next
  }
  next.push({ name: event.name, status: event.status, detail: event.detail })
  return next
}
