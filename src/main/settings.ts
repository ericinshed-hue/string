import { app, safeStorage } from 'electron'
import { existsSync, promises as fs } from 'fs'
import path from 'path'
import { DEFAULT_EDITOR_FONT, DEFAULT_UI_FONT_SIZE, coerceEditorFont, coerceUiFontSize } from '../shared/fonts'
import { coerceHandbook, coerceShortcuts, defaultHandbook, defaultShortcuts, prepareHandbook, prepareShortcuts } from '../shared/handbook'
import { coerceSkills, prepareSkills } from '../shared/skills'
import type { HandbookRule, ProfileInput, PublicProfile, PublicSettings, ShortcutBinding, Skill, Zone } from '../shared/types'
import { libraryId } from '../shared/library'
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
  libraries: string[]
  activeProfileId: string | null
  profiles: StoredProfile[]
  systemPrompt: string
  handbook: HandbookRule[]
  shortcuts: ShortcutBinding[]
  editorFont: string
  uiFont: string
  uiFontSize: number
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
    libraries: [],
    activeProfileId: null,
    profiles: [],
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    handbook: defaultHandbook(),
    shortcuts: defaultShortcuts(),
    editorFont: DEFAULT_EDITOR_FONT,
    uiFont: DEFAULT_EDITOR_FONT,
    uiFontSize: DEFAULT_UI_FONT_SIZE,
    skills: [],
    licenseCode: null,
    lastOpen: { note: null, routine: null },
    lastZone: 'routine'
  }
}

function dedupePaths(folders: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const folder of folders) {
    const resolved = path.resolve(folder)
    const key = resolved.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(resolved)
  }
  return out
}

export function migrateVaultRoot(vaultRoot: string): string[] {
  const note = path.join(vaultRoot, 'Note')
  const routine = path.join(vaultRoot, 'Routine')
  const found = [note, routine].filter((dir) => existsSync(dir))
  return dedupePaths(found.length ? found : [vaultRoot])
}

function prefixOpen(root: string | undefined, rel: string | null | undefined): string | null {
  if (!rel || !root) return rel ?? null
  const id = libraryId(root)
  return rel.startsWith(`${id}/`) ? rel : `${id}/${rel.replace(/^[/\\]+/, '')}`
}

export async function loadSettings(): Promise<SettingsFile> {
  try {
    const raw = await fs.readFile(filePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<SettingsFile>
    const hadLibraries = Array.isArray(parsed.libraries)
    const libraries = hadLibraries
      ? dedupePaths(parsed.libraries!.filter((item): item is string => typeof item === 'string' && item.trim().length > 0))
      : parsed.vaultRoot
        ? migrateVaultRoot(parsed.vaultRoot)
        : []
    const lastOpen = { ...emptySettings().lastOpen, ...parsed.lastOpen }
    if (!hadLibraries && libraries.length) {
      const note = libraries.find((dir) => path.basename(dir).toLowerCase() === 'note')
      const routine = libraries.find((dir) => path.basename(dir).toLowerCase() === 'routine')
      lastOpen.note = prefixOpen(note ?? libraries[0], lastOpen.note)
      lastOpen.routine = prefixOpen(routine ?? libraries[0], lastOpen.routine)
    }
    const settings: SettingsFile = {
      ...emptySettings(),
      ...parsed,
      libraries,
      vaultRoot: libraries[0] ?? null,
      lastOpen,
      handbook: coerceHandbook(parsed.handbook),
      shortcuts: coerceShortcuts(parsed.shortcuts),
      editorFont: coerceEditorFont(parsed.editorFont),
      uiFont: coerceEditorFont(parsed.uiFont),
      uiFontSize: coerceUiFontSize(parsed.uiFontSize),
      skills: coerceSkills(parsed.skills),
      licenseCode: typeof parsed.licenseCode === 'string' ? parsed.licenseCode : null
    }
    if (!hadLibraries && libraries.length) await saveSettings(settings)
    return settings
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
    vaultRoot: settings.libraries[0] ?? null,
    libraries: settings.libraries,
    suggestedVault: suggestVault(),
    activeProfileId: settings.activeProfileId,
    profiles: settings.profiles.map(toPublic),
    systemPrompt: settings.systemPrompt,
    handbook: settings.handbook,
    shortcuts: settings.shortcuts,
    editorFont: settings.editorFont,
    uiFont: settings.uiFont,
    uiFontSize: settings.uiFontSize,
    skills: settings.skills,
    activated: !app.isPackaged || verifyLicense(settings.licenseCode) !== null,
    account: verifyLicense(settings.licenseCode),
    version: app.getVersion(),
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
  settings.libraries = migrateVaultRoot(vaultRoot)
  settings.vaultRoot = settings.libraries[0] ?? null
  await saveSettings(settings)
}

export async function addLibrary(folder: string): Promise<void> {
  const settings = await loadSettings()
  const next = path.resolve(folder)
  if (!settings.libraries.some((item) => item.toLowerCase() === next.toLowerCase())) {
    settings.libraries = [...settings.libraries, next]
  }
  settings.vaultRoot = settings.libraries[0] ?? null
  await saveSettings(settings)
}

export async function removeLibrary(folder: string): Promise<void> {
  const settings = await loadSettings()
  const target = path.resolve(folder).toLowerCase()
  settings.libraries = settings.libraries.filter((item) => path.resolve(item).toLowerCase() !== target)
  settings.vaultRoot = settings.libraries[0] ?? null
  await saveSettings(settings)
}

export async function currentLibraries(): Promise<string[]> {
  const settings = await loadSettings()
  return settings.libraries
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
  uiFont: string,
  uiFontSize: number,
  skills: Skill[]
): Promise<void> {
  const settings = await loadSettings()
  settings.handbook = prepareHandbook(handbook)
  settings.shortcuts = prepareShortcuts(shortcuts)
  settings.editorFont = coerceEditorFont(editorFont)
  settings.uiFont = coerceEditorFont(uiFont)
  settings.uiFontSize = coerceUiFontSize(uiFontSize)
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
  const libraries = await currentLibraries()
  return libraries[0] ?? null
}
