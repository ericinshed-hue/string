import { randomUUID } from 'crypto'
import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import type { ChatDesk, ChatSessionInfo, StoredMessage, Zone } from '../shared/types'
import { projectChat } from '../shared/chat'

type SessionRecord = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: StoredMessage[]
}

type ZoneStore = {
  activeId: string
  sessions: SessionRecord[]
}

function storeFile(zone: Zone): string {
  return path.join(app.getPath('userData'), 'chats', `${zone}.json`)
}

function titleFrom(messages: StoredMessage[]): string {
  const first = messages.find((message) => message.role === 'user' && message.content.trim())
  if (!first) return 'New chat'
  const text = first.content.replace(/\s+/g, ' ').trim()
  return text.length > 22 ? `${text.slice(0, 22)}…` : text
}

function emptySession(): SessionRecord {
  const now = new Date().toISOString()
  return { id: randomUUID(), title: 'New chat', createdAt: now, updatedAt: now, messages: [] }
}

async function readStore(zone: Zone): Promise<ZoneStore> {
  try {
    const raw = JSON.parse(await fs.readFile(storeFile(zone), 'utf8')) as ZoneStore | StoredMessage[]
    if (Array.isArray(raw)) {
      const session = emptySession()
      session.messages = raw
      session.title = titleFrom(raw)
      return { activeId: session.id, sessions: [session] }
    }
    if (!raw || !Array.isArray(raw.sessions) || raw.sessions.length === 0) {
      const session = emptySession()
      return { activeId: session.id, sessions: [session] }
    }
    const activeId = raw.sessions.some((session) => session.id === raw.activeId) ? raw.activeId : raw.sessions[0].id
    return { activeId, sessions: raw.sessions }
  } catch {
    const session = emptySession()
    return { activeId: session.id, sessions: [session] }
  }
}

async function writeStore(zone: Zone, store: ZoneStore): Promise<void> {
  const file = storeFile(zone)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(store), 'utf8')
}

function toInfo(session: SessionRecord): ChatSessionInfo {
  return { id: session.id, title: session.title, updatedAt: session.updatedAt }
}

function desk(store: ZoneStore): ChatDesk {
  const active = store.sessions.find((session) => session.id === store.activeId) ?? store.sessions[0]
  return {
    activeId: active.id,
    sessions: [...store.sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(toInfo),
    messages: projectChat(active.messages)
  }
}

export async function loadDesk(zone: Zone): Promise<ChatDesk> {
  return desk(await readStore(zone))
}

export async function createSession(zone: Zone): Promise<ChatDesk> {
  const store = await readStore(zone)
  const session = emptySession()
  store.sessions.unshift(session)
  store.activeId = session.id
  await writeStore(zone, store)
  return desk(store)
}

export async function openSession(zone: Zone, id: string): Promise<ChatDesk> {
  const store = await readStore(zone)
  if (!store.sessions.some((session) => session.id === id)) throw new Error('Chat not found')
  store.activeId = id
  await writeStore(zone, store)
  return desk(store)
}

export async function removeSession(zone: Zone, id: string): Promise<ChatDesk> {
  const store = await readStore(zone)
  store.sessions = store.sessions.filter((session) => session.id !== id)
  if (store.sessions.length === 0) {
    const session = emptySession()
    store.sessions = [session]
    store.activeId = session.id
  } else if (!store.sessions.some((session) => session.id === store.activeId)) {
    store.activeId = store.sessions[0].id
  }
  await writeStore(zone, store)
  return desk(store)
}

export async function readSession(zone: Zone, id: string): Promise<StoredMessage[]> {
  const store = await readStore(zone)
  const session = store.sessions.find((item) => item.id === id)
  if (!session) throw new Error('Chat not found')
  return session.messages
}

export async function writeSession(zone: Zone, id: string, messages: StoredMessage[]): Promise<void> {
  const store = await readStore(zone)
  const session = store.sessions.find((item) => item.id === id)
  if (!session) throw new Error('Chat not found')
  session.messages = messages
  session.title = titleFrom(messages)
  session.updatedAt = new Date().toISOString()
  await writeStore(zone, store)
}
