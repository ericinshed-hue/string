import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import type { TrashItem, TreeNode, Zone } from '../shared/types'
import {
  assertInside,
  isReservedRel,
  normalizePosix,
  relativeLink,
  rewriteMarkdownLinks,
  toPosixRel,
  zoneFolder
} from '../shared/paths'
import { isSealed, openText, SEAL_MAGIC, sealText } from './seal'

type TrashMeta = TrashItem

function zoneRoot(vaultRoot: string, zone: Zone): string {
  return path.join(vaultRoot, zoneFolder(zone))
}

async function realInside(root: string, target: string): Promise<string> {
  const resolved = assertInside(root, target)
  try {
    const realRoot = await fs.realpath(root)
    const realTarget = await fs.realpath(resolved)
    return assertInside(realRoot, realTarget)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') throw error
    const parent = path.dirname(resolved)
    await fs.mkdir(parent, { recursive: true })
    const realRoot = await fs.realpath(root)
    const realParent = await fs.realpath(parent)
    assertInside(realRoot, realParent)
    return assertInside(realRoot, path.join(realParent, path.basename(resolved)))
  }
}

function noteRel(rel: string): string {
  const normalized = normalizePosix(rel)
  if (!normalized || isReservedRel(normalized)) {
    throw new Error('That path is reserved or empty')
  }
  return normalized
}

async function resolveNote(vaultRoot: string, zone: Zone, rel: string): Promise<string> {
  const root = zoneRoot(vaultRoot, zone)
  await fs.mkdir(root, { recursive: true })
  return realInside(root, path.resolve(root, noteRel(rel)))
}

async function replaceFile(abs: string, content: string): Promise<void> {
  const tmp = `${abs}.${process.pid}.tmp`
  const bak = `${abs}.${process.pid}.bak`
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(tmp, content, 'utf8')
  let movedAside = false
  try {
    await fs.rename(abs, bak)
    movedAside = true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      await fs.rm(tmp, { force: true })
      throw error
    }
  }
  try {
    await fs.rename(tmp, abs)
  } catch {
    await fs.copyFile(tmp, abs)
    await fs.rm(tmp, { force: true })
  }
  if (movedAside) await fs.rm(bak, { force: true })
}

export async function ensureZoneDirs(vaultRoot: string): Promise<void> {
  for (const zone of ['note', 'routine'] as Zone[]) {
    const root = zoneRoot(vaultRoot, zone)
    await fs.mkdir(path.join(root, 'assets'), { recursive: true })
    await fs.mkdir(path.join(root, '.trash'), { recursive: true })
  }
}

export async function listTree(vaultRoot: string, zone: Zone): Promise<TreeNode[]> {
  const root = zoneRoot(vaultRoot, zone)
  await fs.mkdir(root, { recursive: true })
  return readLevel(root, root)
}

async function readLevel(dir: string, root: string): Promise<TreeNode[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const nodes: TreeNode[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (dir === root && (entry.name === 'assets' || entry.name === '.trash')) continue
    const abs = path.join(dir, entry.name)
    const rel = toPosixRel(root, abs)
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: rel,
        type: 'folder',
        children: await readLevel(abs, root)
      })
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      nodes.push({ name: entry.name, path: rel, type: 'file', encrypted: await fileIsSealed(abs) })
    }
  }
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name, 'zh')
  })
  return nodes
}

export async function readNote(vaultRoot: string, zone: Zone, rel: string): Promise<string> {
  const abs = await resolveNote(vaultRoot, zone, rel)
  const raw = await fs.readFile(abs, 'utf8')
  if (isSealed(raw)) throw new Error('This note is encrypted')
  return raw
}

export async function noteIsSealed(vaultRoot: string, zone: Zone, rel: string): Promise<boolean> {
  const abs = await resolveNote(vaultRoot, zone, rel)
  return fileIsSealed(abs)
}

export async function sealNote(vaultRoot: string, zone: Zone, rel: string, password: string): Promise<void> {
  const abs = await resolveNote(vaultRoot, zone, rel)
  const raw = await fs.readFile(abs, 'utf8')
  if (isSealed(raw)) throw new Error('This note is already encrypted')
  await replaceFile(abs, await sealText(raw, password))
}

export async function openNote(vaultRoot: string, zone: Zone, rel: string, password: string): Promise<string> {
  const abs = await resolveNote(vaultRoot, zone, rel)
  return openText(await fs.readFile(abs, 'utf8'), password)
}

export async function writeSealedNote(vaultRoot: string, zone: Zone, rel: string, content: string, password: string): Promise<void> {
  const abs = await resolveNote(vaultRoot, zone, rel)
  const raw = await fs.readFile(abs, 'utf8')
  if (!isSealed(raw)) throw new Error('This note is not encrypted')
  await openText(raw, password)
  await replaceFile(abs, await sealText(content, password))
}

export async function releaseNote(vaultRoot: string, zone: Zone, rel: string, password: string): Promise<string> {
  const abs = await resolveNote(vaultRoot, zone, rel)
  const plain = await openText(await fs.readFile(abs, 'utf8'), password)
  await replaceFile(abs, plain)
  return plain
}

export async function writeNote(vaultRoot: string, zone: Zone, rel: string, content: string): Promise<void> {
  const normalized = noteRel(rel)
  if (!normalized.toLowerCase().endsWith('.md')) throw new Error('Only Markdown files can be written')
  const abs = await resolveNote(vaultRoot, zone, normalized)
  if (await fileIsSealed(abs)) throw new Error('This note is encrypted')
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await replaceFile(abs, content)
}

export async function createFolder(vaultRoot: string, zone: Zone, rel: string): Promise<void> {
  const abs = await resolveNote(vaultRoot, zone, rel)
  await fs.mkdir(abs, { recursive: true })
}

export async function absoluteNotePath(vaultRoot: string, zone: Zone, rel: string): Promise<string> {
  return resolveNote(vaultRoot, zone, rel)
}

export async function zoneDirectory(vaultRoot: string, zone: Zone): Promise<string> {
  const root = zoneRoot(vaultRoot, zone)
  await fs.mkdir(root, { recursive: true })
  return root
}

export async function pasteEntries(vaultRoot: string, zone: Zone, parentRel: string, sources: string[]): Promise<void> {
  if (!sources.length) throw new Error('Clipboard has no files')
  const root = zoneRoot(vaultRoot, zone)
  await fs.mkdir(root, { recursive: true })
  let destDir = root
  if (parentRel) {
    destDir = await resolveNote(vaultRoot, zone, parentRel)
    const info = await fs.stat(destDir)
    if (!info.isDirectory()) throw new Error('Paste into a folder')
  }
  for (const source of sources) await pasteOne(root, destDir, source)
}

async function pasteOne(root: string, destDir: string, source: string): Promise<void> {
  const srcStat = await fs.stat(source).catch(() => {
    throw new Error('That file is no longer available')
  })
  if (!srcStat.isFile() && !srcStat.isDirectory()) throw new Error('That item cannot be pasted')
  const base = path.basename(source)
  if (!base || base === '.' || base === '..') throw new Error('That file name is invalid')
  const name = await uniqueSiblingName(destDir, base)
  const dest = assertInside(root, path.join(destDir, name))
  if (isReservedRel(toPosixRel(root, dest))) throw new Error('That path is reserved or empty')
  if (srcStat.isDirectory()) {
    const inward = path.relative(source, dest)
    if (inward === '' || (!inward.startsWith('..') && !path.isAbsolute(inward))) {
      throw new Error('A folder cannot be pasted into itself')
    }
  }
  await fs.cp(source, dest, { recursive: true, errorOnExist: true })
  if (srcStat.isDirectory()) await rewriteCopiedTree(dest, source, dest)
  else if (dest.toLowerCase().endsWith('.md')) {
    const content = await fs.readFile(dest, 'utf8')
    if (!isSealed(content)) {
      const next = rewriteMarkdownLinks(content, source, dest)
      if (next !== content) await replaceFile(dest, next)
    }
  }
}

async function uniqueSiblingName(dir: string, name: string): Promise<string> {
  const ext = path.extname(name)
  const stem = ext ? name.slice(0, -ext.length) : name
  if (!(await exists(path.join(dir, name)))) return name
  for (let n = 1; n < 100; n += 1) {
    const suffix = n === 1 ? ' copy' : ` copy ${n}`
    const candidate = `${stem}${suffix}${ext}`
    if (!(await exists(path.join(dir, candidate)))) return candidate
  }
  throw new Error('Could not find a free name')
}

async function rewriteCopiedTree(currentDest: string, srcRoot: string, destRoot: string): Promise<void> {
  const entries = await fs.readdir(currentDest, { withFileTypes: true })
  for (const entry of entries) {
    const destAbs = path.join(currentDest, entry.name)
    if (entry.isDirectory()) {
      await rewriteCopiedTree(destAbs, srcRoot, destRoot)
      continue
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue
    const oldFile = path.join(srcRoot, path.relative(destRoot, destAbs))
    const content = await fs.readFile(destAbs, 'utf8')
    if (isSealed(content)) continue
    const next = rewriteMarkdownLinks(content, oldFile, destAbs)
    if (next !== content) await replaceFile(destAbs, next)
  }
}

export async function moveNote(vaultRoot: string, zone: Zone, fromRel: string, toRel: string): Promise<void> {
  const from = await resolveNote(vaultRoot, zone, fromRel)
  const to = await resolveNote(vaultRoot, zone, toRel)
  const info = await fs.stat(from)
  if (info.isFile() && !to.toLowerCase().endsWith('.md')) throw new Error('Notes must end in .md')
  const inward = path.relative(from, to)
  if (inward === '' || (!inward.startsWith('..') && !path.isAbsolute(inward))) {
    throw new Error('A folder cannot be moved into itself')
  }
  await fs.mkdir(path.dirname(to), { recursive: true })
  if (info.isDirectory()) {
    await rewriteTreeLinks(from, from, to)
    await fs.rename(from, to)
    return
  }
  const content = await fs.readFile(from, 'utf8')
  if (!isSealed(content)) {
    const next = rewriteMarkdownLinks(content, from, to)
    await fs.rename(from, to)
    if (next !== content) await replaceFile(to, next)
    return
  }
  await fs.rename(from, to)
}

async function rewriteTreeLinks(current: string, oldRoot: string, newRoot: string): Promise<void> {
  const entries = await fs.readdir(current, { withFileTypes: true })
  for (const entry of entries) {
    const abs = path.join(current, entry.name)
    if (entry.isDirectory()) {
      await rewriteTreeLinks(abs, oldRoot, newRoot)
      continue
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue
    const oldFile = abs
    const relInside = path.relative(oldRoot, abs)
    const newFile = path.join(newRoot, relInside)
    const content = await fs.readFile(abs, 'utf8')
    if (isSealed(content)) continue
    const next = rewriteMarkdownLinks(content, oldFile, newFile)
    if (next !== content) await replaceFile(abs, next)
  }
}

export async function saveImage(
  vaultRoot: string,
  zone: Zone,
  noteRelPath: string,
  filename: string,
  data: Buffer
): Promise<string> {
  const noteAbs = await resolveNote(vaultRoot, zone, noteRelPath)
  const root = zoneRoot(vaultRoot, zone)
  const assets = path.join(root, 'assets')
  await fs.mkdir(assets, { recursive: true })
  const safe = filename.replace(/[^\w.\-\u4e00-\u9fff]+/g, '_').replace(/^_+/, '') || 'image.png'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const assetAbs = await realInside(assets, path.join(assets, `${stamp}-${safe}`))
  await fs.writeFile(assetAbs, data)
  return relativeLink(noteAbs, assetAbs)
}

export async function deleteToTrash(vaultRoot: string, zone: Zone, rel: string): Promise<TrashItem> {
  const abs = await resolveNote(vaultRoot, zone, rel)
  const info = await fs.stat(abs)
  const root = zoneRoot(vaultRoot, zone)
  const id = randomUUID()
  const bucket = path.join(root, '.trash', id)
  await fs.mkdir(bucket, { recursive: true })
  const meta: TrashMeta = {
    id,
    name: path.basename(abs),
    originalRelativePath: toPosixRel(root, abs),
    deletedAt: new Date().toISOString(),
    kind: info.isDirectory() ? 'folder' : 'file'
  }
  await fs.writeFile(path.join(bucket, 'meta.json'), JSON.stringify(meta), 'utf8')
  const payload = path.join(bucket, info.isDirectory() ? 'payload' : `payload${path.extname(abs)}`)
  await fs.rename(abs, payload)
  return meta
}

export async function listTrash(vaultRoot: string, zone: Zone): Promise<TrashItem[]> {
  const dir = path.join(zoneRoot(vaultRoot, zone), '.trash')
  await fs.mkdir(dir, { recursive: true })
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const items: TrashItem[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      const raw = await fs.readFile(path.join(dir, entry.name, 'meta.json'), 'utf8')
      items.push(JSON.parse(raw) as TrashItem)
    } catch {
      continue
    }
  }
  items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
  return items
}

export async function restoreTrash(vaultRoot: string, zone: Zone, id: string): Promise<string> {
  if (!/^[\w-]+$/.test(id)) throw new Error('That trash item is invalid')
  const root = zoneRoot(vaultRoot, zone)
  const bucket = path.join(root, '.trash', id)
  const meta = JSON.parse(await fs.readFile(path.join(bucket, 'meta.json'), 'utf8')) as TrashMeta
  const payloadName = meta.kind === 'folder' ? 'payload' : `payload${path.extname(meta.name)}`
  const payload = path.join(bucket, payloadName)
  let destRel = meta.originalRelativePath
  let dest = await resolveNote(vaultRoot, zone, destRel)
  if (await exists(dest)) {
    const ext = path.extname(destRel)
    const base = ext ? destRel.slice(0, -ext.length) : destRel
    destRel = `${base}-restored${ext}`
    dest = await resolveNote(vaultRoot, zone, destRel)
  }
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await fs.rename(payload, dest)
  await fs.rm(bucket, { recursive: true, force: true })
  return destRel
}

export async function emptyTrash(vaultRoot: string, zone: Zone): Promise<void> {
  const dir = path.join(zoneRoot(vaultRoot, zone), '.trash')
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.stat(target)
    return true
  } catch {
    return false
  }
}

async function fileIsSealed(abs: string): Promise<boolean> {
  let handle: fs.FileHandle
  try {
    handle = await fs.open(abs, 'r')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
  try {
    const buf = Buffer.alloc(SEAL_MAGIC.length)
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0)
    return bytesRead === buf.length && buf.toString('utf8') === SEAL_MAGIC
  } finally {
    await handle.close()
  }
}

export async function walkNotes(
  vaultRoot: string,
  zone: Zone
): Promise<Array<{ path: string; name: string; content: string }>> {
  const root = zoneRoot(vaultRoot, zone)
  await fs.mkdir(root, { recursive: true })
  const files: Array<{ path: string; name: string; content: string }> = []
  await walk(root, root, files)
  return files
}

async function walk(
  dir: string,
  root: string,
  files: Array<{ path: string; name: string; content: string }>
): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (dir === root && entry.name === 'assets') continue
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(abs, root, files)
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      const content = await fs.readFile(abs, 'utf8')
      files.push({
        path: toPosixRel(root, abs),
        name: entry.name,
        content: isSealed(content) ? '' : content
      })
    }
  }
}
