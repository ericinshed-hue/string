import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import type { UsageStats } from '../shared/types'

type UsageFile = {
  requests: number
  promptTokens: number
  completionTokens: number
  updatedAt: string | null
}

function filePath(): string {
  return path.join(app.getPath('userData'), 'usage.json')
}

function emptyUsage(): UsageFile {
  return { requests: 0, promptTokens: 0, completionTokens: 0, updatedAt: null }
}

export async function loadUsage(): Promise<UsageStats> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath(), 'utf8')) as Partial<UsageFile>
    return {
      requests: Number(parsed.requests) || 0,
      promptTokens: Number(parsed.promptTokens) || 0,
      completionTokens: Number(parsed.completionTokens) || 0,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null
    }
  } catch {
    return emptyUsage()
  }
}

export async function recordUsage(usage?: { promptTokens?: number; completionTokens?: number }): Promise<void> {
  const current = await loadUsage()
  const next: UsageFile = {
    requests: current.requests + 1,
    promptTokens: current.promptTokens + (usage?.promptTokens ?? 0),
    completionTokens: current.completionTokens + (usage?.completionTokens ?? 0),
    updatedAt: new Date().toISOString()
  }
  await fs.mkdir(path.dirname(filePath()), { recursive: true })
  await fs.writeFile(filePath(), JSON.stringify(next, null, 2), 'utf8')
}
