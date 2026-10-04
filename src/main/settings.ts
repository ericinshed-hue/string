import { app, safeStorage } from 'electron'
import { existsSync, promises as fs } from 'fs'
import path from 'path'
import { DEFAULT_EDITOR_FONT, coerceEditorFont } from '../shared/fonts'
import { coerceHandbook, coerceShortcuts, defaultHandbook, defaultShortcuts, prepareHandbook, prepareShortcuts } from '../shared/handbook'
import { coerceSkills, prepareSkills } from '../shared/skills'
import type { HandbookRule, ProfileInput, PublicProfile, PublicSettings, ShortcutBinding, Skill, Zone } from '../shared/types'
import { DEFAULT_SYSTEM_PROMPT } from '../shared/types'
import { verifyLicense } from './license'

type StoredProfile = {
  id: string
  name: string
  baseURL: string
  model: string
  keyEnc: string | null
}

type SettingsFile = {
  vaultRoot: string | null
  activeProfileId: string | null
  profiles: StoredProfile[]
  systemPrompt: string
  handbook: HandbookRule[]
  shortcuts: ShortcutBinding[]
  editorFont: string
  skills: Skill[]
  licenseCode: string | null
  lastOpen: Record<Zone, string | null>
  lastZone: Zone
}

function filePath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function emptySettings(): SettingsFile {
  return {
    vaultRoot: null,
    activeProfileId: null,
    profiles: [],
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    handbook: defaultHandbook(),
    shortcuts: defaultShortcuts(),
    editorFont: DEFAULT_EDITOR_FONT,
    skills: [],
    licenseCode: null,
    lastOpen: { note: null, routine: null },
    lastZone: 'routine'
  }
}

export async function loadSettings(): Promise<SettingsFile> {
  try {
    const raw = await fs.readFile(filePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<SettingsFile>
    return {
      ...emptySettings(),
      ...parsed,
      lastOpen: { ...emptySettings().lastOpen, ...parsed.lastOpen },
      handbook: coerceHandbook(parsed.handbook),
      shortcuts: coerceShortcuts(parsed.shortcuts),
      editorFont: coerceEditorFont(parsed.editorFont),
      skills: coerceSkills(parsed.skills),
      licenseCode: typeof parsed.licenseCode === 'string' ? parsed.licenseCode : null
    }
  } catch {
    return emptySettings()
  }
}

async function saveSettings(settings: SettingsFile): Promise<void> {
  await fs.mkdir(path.dirname(filePath()), { recursive: true })
  const tmp = `${filePath()}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify(settings, null, 2), 'utf8')
  await fs.rename(tmp, filePath()).catch(async () => {
    await fs.copyFile(tmp, filePath())
    await fs.rm(tmp, { force: true })
  })
}

function encryptKey(key: string): string | null {
  if (!key) return null
  if (!safeStorage.isEncryptionAvailable()) return `plain:${Buffer.from(key, 'utf8').toString('base64')}`
  return Buffer.from(safeStorage.encryptString(key)).toString('base64')
}

export function decryptKey(keyEnc: string | null): string {
  if (!keyEnc) return ''
  if (keyEnc.startsWith('plain:')) return Buffer.from(keyEnc.slice(6), 'base64').toString('utf8')
  return safeStorage.decryptString(Buffer.from(keyEnc, 'base64'))
}

function hint(keyEnc: string | null): string {
  const key = keyEnc ? decryptKey(keyEnc) : ''
  if (!key) return ''
  return key.length <= 4 ? 'Saved' : `••••${key.slice(-4)}`
}

export function suggestVault(): string | null {
  const appPath = app.getAppPath()
  const candidates = [
    path.join(process.cwd(), 'Routine_Note'),
    path.join(appPath, 'Routine_Note'),
    path.join(appPath, '..', 'Routine_Note'),
    path.join(appPath, '..', '..', 'Routine_Note')
  ]
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'Note')) && existsSync(path.join(candidate, 'Routine'))) {
      return candidate
    }
  }
  return null
}

export async function publicSettings(): Promise<PublicSettings> {
  const settings = await loadSettings()
  return {
    vaultRoot: settings.vaultRoot,
    suggestedVault: suggestVault(),
    activeProfileId: settings.activeProfileId,
    profiles: settings.profiles.map(toPublic),
    systemPrompt: settings.systemPrompt,
    handbook: settings.handbook,
    shortcuts: settings.shortcuts,
    editorFont: settings.editorFont,
    skills: settings.skills,
    activated: !app.isPackaged || verifyLicense(settings.licenseCode) !== null,
    lastOpen: settings.lastOpen,
    lastZone: settings.lastZone
  }
}

function toPublic(profile: StoredProfile): PublicProfile {
  return {
    id: profile.id,
    name: profile.name,
    baseURL: profile.baseURL,
    model: profile.model,
    hasKey: Boolean(profile.keyEnc),
    keyHint: hint(profile.keyEnc)
  }
}

export async function setVaultRoot(vaultRoot: string): Promise<void> {
  const settings = await loadSettings()
  settings.vaultRoot = vaultRoot
  await saveSettings(settings)
}

export async function setLastOpen(zone: Zone, rel: string | null): Promise<void> {
  const settings = await loadSettings()
  settings.lastOpen[zone] = rel
  settings.lastZone = zone
  await saveSettings(settings)
}

export async function saveProfileSettings(
  profiles: ProfileInput[],
  activeProfileId: string | null,
  systemPrompt: string
): Promise<void> {
  const settings = await loadSettings()
  const previous = new Map(settings.profiles.map((profile) => [profile.id, profile]))
  settings.profiles = profiles.map((profile) => {
    const old = previous.get(profile.id)
    let keyEnc = old?.keyEnc ?? null
    if (!profile.keepKey) keyEnc = encryptKey(profile.apiKey.trim())
    return {
      id: profile.id,
      name: profile.name.trim() || 'Untitled',
      baseURL: profile.baseURL.trim(),
      model: profile.model.trim(),
      keyEnc
    }
  })
  settings.activeProfileId = settings.profiles.some((profile) => profile.id === activeProfileId)
    ? activeProfileId
    : (settings.profiles[0]?.id ?? null)
  settings.systemPrompt = systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT
  await saveSettings(settings)
}

export async function saveEditorSettings(
  handbook: HandbookRule[],
  shortcuts: ShortcutBinding[],
  editorFont: string,
  skills: Skill[]
): Promise<void> {
  const settings = await loadSettings()
  settings.handbook = prepareHandbook(handbook)
  settings.shortcuts = prepareShortcuts(shortcuts)
  settings.editorFont = coerceEditorFont(editorFont)
  settings.skills = prepareSkills(skills)
  await saveSettings(settings)
}

export async function saveLicenseCode(code: string): Promise<void> {
  if (!verifyLicense(code)) throw new Error('That activation code is invalid')
  const settings = await loadSettings()
  settings.licenseCode = code.trim()
  await saveSettings(settings)
}

export async function activeProfile(): Promise<{ baseURL: string; model: string; apiKey: string; systemPrompt: string } | null> {
  const settings = await loadSettings()
  const profile = settings.profiles.find((item) => item.id === settings.activeProfileId) ?? settings.profiles[0]
  if (!profile) return null
  return {
    baseURL: profile.baseURL,
    model: profile.model,
    apiKey: decryptKey(profile.keyEnc),
    systemPrompt: settings.systemPrompt
  }
}

export async function currentVault(): Promise<string | null> {
  const settings = await loadSettings()
  return settings.vaultRoot
}
