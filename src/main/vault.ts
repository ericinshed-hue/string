import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import { libraryId } from '../shared/library'
import type { TrashItem, TreeNode } from '../shared/types'
import {
  assertInside,
  isReservedRel,
  normalizePosix,
  relativeLink,
  rewriteMarkdownLinks,
  toPosixRel
} from '../shared/paths'
import { isSealed, openText, SEAL_MAGIC, sealText } from './seal'

type TrashMeta = TrashItem

export { libraryId }

function splitStored(libraries: string[], stored: string): { root: string; rel: string } {
  const slash = stored.indexOf('/')
  if (slash > 0) {
    const id = stored.slice(0, slash)
    const root = libraries.find((item) => libraryId(item) === id)
    if (root) return { root, rel: stored.slice(slash + 1) }
  }
  const root = libraries[0]
  if (!root) throw new Error('No library selected')
  return { root, rel: stored }
}

function withLibrary(root: string, rel: string): string {
  const id = libraryId(root)
  return rel.startsWith(`${id}/`) ? rel : `${id}/${rel}`
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

async function resolveNote(libraries: string[], rel: string): Promise<string> {
  const located = splitStored(libraries, rel)
  await fs.mkdir(located.root, { recursive: true })
  return realInside(located.root, path.resolve(located.root, noteRel(located.rel)))
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

export async function ensureZoneDirs(libraries: string[]): Promise<void> {
  for (const root of libraries) {
    try {
      const stat = await fs.stat(root)
      if (!stat.isDirectory()) continue
    } catch {
      continue
    }
    await fs.mkdir(path.join(root, 'assets'), { recursive: true })
    await fs.mkdir(path.join(root, '.trash'), { recursive: true })
  }
}

export async function listTree(libraries: string[]): Promise<TreeNode[]> {
  const groups: Array<{ root: string; nodes: TreeNode[] }> = []
  for (const root of libraries) {
    try {
      const stat = await fs.stat(root)
      if (!stat.isDirectory()) continue
    } catch {
      continue
    }
    groups.push({ root, nodes: await readLevel(root, root, libraryId(root)) })
  }
  const counts = new Map<string, number>()
  for (const group of groups) {
    for (const node of group.nodes) counts.set(node.name, (counts.get(node.name) ?? 0) + 1)
  }
  const merged: TreeNode[] = []
  for (const group of groups) {
    const base = path.basename(group.root)
    for (const node of group.nodes) {
      if ((counts.get(node.name) ?? 0) > 1) merged.push({ ...node, name: `${node.name} (${base})` })
      else merged.push(node)
    }
  }
  merged.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name, 'zh')
  })
  return merged
}

async function readLevel(dir: string, root: string, id: string): Promise<TreeNode[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const nodes: TreeNode[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (dir === root && (entry.name === 'assets' || entry.name === '.trash')) continue
    const abs = path.join(dir, entry.name)
    const rel = `${id}/${toPosixRel(root, abs)}`
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: rel,
        type: 'folder',
        children: await readLevel(abs, root, id)
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

export async function readNote(libraries: string[], rel: string): Promise<string> {
  const abs = await resolveNote(libraries, rel)
  const raw = await fs.readFile(abs, 'utf8')
  if (isSealed(raw)) throw new Error('This note is encrypted')
  return raw
}

export async function noteIsSealed(libraries: string[], rel: string): Promise<boolean> {
  const abs = await resolveNote(libraries, rel)
  return fileIsSealed(abs)
}

export async function sealNote(libraries: string[], rel: string, password: string): Promise<void> {
  const abs = await resolveNote(libraries, rel)
  const raw = await fs.readFile(abs, 'utf8')
  if (isSealed(raw)) throw new Error('This note is already encrypted')
  await replaceFile(abs, await sealText(raw, password))
}

export async function openNote(libraries: string[], rel: string, password: string): Promise<string> {
  const abs = await resolveNote(libraries, rel)
  return openText(await fs.readFile(abs, 'utf8'), password)
}

export async function writeSealedNote(libraries: string[], rel: string, content: string, password: string): Promise<void> {
  const abs = await resolveNote(libraries, rel)
  const raw = await fs.readFile(abs, 'utf8')
  if (!isSealed(raw)) throw new Error('This note is not encrypted')
  await openText(raw, password)
  await replaceFile(abs, await sealText(content, password))
}

export async function releaseNote(libraries: string[], rel: string, password: string): Promise<string> {
  const abs = await resolveNote(libraries, rel)
  const plain = await openText(await fs.readFile(abs, 'utf8'), password)
  await replaceFile(abs, plain)
  return plain
}

export async function writeNote(libraries: string[], rel: string, content: string): Promise<void> {
  const inner = noteRel(splitStored(libraries, rel).rel)
  if (!inner.toLowerCase().endsWith('.md')) throw new Error('Only Markdown files can be written')
  const abs = await resolveNote(libraries, rel)
  if (await fileIsSealed(abs)) throw new Error('This note is encrypted')
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await replaceFile(abs, content)
}

export async function createFolder(libraries: string[], rel: string): Promise<void> {
  const abs = await resolveNote(libraries, rel)
  await fs.mkdir(abs, { recursive: true })
}

export async function absoluteNotePath(libraries: string[], rel: string): Promise<string> {
  return resolveNote(libraries, rel)
}

export async function zoneDirectory(libraries: string[]): Promise<string> {
  const root = libraries[0]
  if (!root) throw new Error('No library selected')
  await fs.mkdir(root, { recursive: true })
  return root
}

export function innerRelative(libraries: string[], stored: string): string {
  return splitStored(libraries, stored).rel
}

export async function pasteEntries(libraries: string[], parentRel: string, sources: string[]): Promise<void> {
  if (!sources.length) throw new Error('Clipboard has no files')
  const root = splitStored(libraries, parentRel).root
  await fs.mkdir(root, { recursive: true })
  let destDir = root
  if (parentRel) {
    destDir = await resolveNote(libraries, parentRel)
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

export async function moveNote(libraries: string[], fromRel: string, toRel: string): Promise<void> {
  const fromRoot = path.resolve(splitStored(libraries, fromRel).root)
  const toRoot = path.resolve(splitStored(libraries, toRel).root)
  if (fromRoot.toLowerCase() !== toRoot.toLowerCase()) throw new Error('A note cannot move to another library')
  const from = await resolveNote(libraries, fromRel)
  const to = await resolveNote(libraries, toRel)
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
  libraries: string[],
  noteRelPath: string,
  filename: string,
  data: Buffer
): Promise<string> {
  const noteAbs = await resolveNote(libraries, noteRelPath)
  const root = splitStored(libraries, noteRelPath).root
  const assets = path.join(root, 'assets')
  await fs.mkdir(assets, { recursive: true })
  const safe = filename.replace(/[^\w.\-\u4e00-\u9fff]+/g, '_').replace(/^_+/, '') || 'image.png'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const assetAbs = await realInside(assets, path.join(assets, `${stamp}-${safe}`))
  await fs.writeFile(assetAbs, data)
  return relativeLink(noteAbs, assetAbs)
}

export async function deleteToTrash(libraries: string[], rel: string): Promise<TrashItem> {
  const abs = await resolveNote(libraries, rel)
  const info = await fs.stat(abs)
  const root = splitStored(libraries, rel).root
  const id = randomUUID()
  const bucket = path.join(root, '.trash', id)
  await fs.mkdir(bucket, { recursive: true })
  const meta: TrashMeta = {
    id,
    name: path.basename(abs),
    originalRelativePath: withLibrary(root, toPosixRel(root, abs)),
    deletedAt: new Date().toISOString(),
    kind: info.isDirectory() ? 'folder' : 'file'
  }
  await fs.writeFile(path.join(bucket, 'meta.json'), JSON.stringify(meta), 'utf8')
  const payload = path.join(bucket, info.isDirectory() ? 'payload' : `payload${path.extname(abs)}`)
  await fs.rename(abs, payload)
  return meta
}

export async function listTrash(libraries: string[]): Promise<TrashItem[]> {
  const items: TrashItem[] = []
  for (const root of libraries) {
    const dir = path.join(root, '.trash')
    let entries: Array<{ name: string; isDirectory: () => boolean }>
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        const raw = await fs.readFile(path.join(dir, entry.name, 'meta.json'), 'utf8')
        const meta = JSON.parse(raw) as TrashItem
        items.push({ ...meta, originalRelativePath: withLibrary(root, meta.originalRelativePath) })
      } catch {
        continue
      }
    }
  }
  items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
  return items
}

export async function restoreTrash(libraries: string[], id: string): Promise<string> {
  if (!/^[\w-]+$/.test(id)) throw new Error('That trash item is invalid')
  let bucket = ''
  let root = ''
  for (const library of libraries) {
    const candidate = path.join(library, '.trash', id)
    try {
      await fs.stat(path.join(candidate, 'meta.json'))
      bucket = candidate
      root = library
      break
    } catch {
      continue
    }
  }
  if (!bucket) throw new Error('That trash item is gone')
  const meta = JSON.parse(await fs.readFile(path.join(bucket, 'meta.json'), 'utf8')) as TrashMeta
  meta.originalRelativePath = withLibrary(root, meta.originalRelativePath)
  const payloadName = meta.kind === 'folder' ? 'payload' : `payload${path.extname(meta.name)}`
  const payload = path.join(bucket, payloadName)
  let destRel = meta.originalRelativePath
  let dest = await resolveNote(libraries, destRel)
  if (await exists(dest)) {
    const ext = path.extname(destRel)
    const base = ext ? destRel.slice(0, -ext.length) : destRel
    destRel = `${base}-restored${ext}`
    dest = await resolveNote(libraries, destRel)
  }
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await fs.rename(payload, dest)
  await fs.rm(bucket, { recursive: true, force: true })
  return destRel
}

export async function emptyTrash(libraries: string[]): Promise<void> {
  for (const root of libraries) {
    const dir = path.join(root, '.trash')
    await fs.rm(dir, { recursive: true, force: true })
    try {
      const stat = await fs.stat(root)
      if (stat.isDirectory()) await fs.mkdir(dir, { recursive: true })
    } catch {
      continue
    }
  }
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
  libraries: string[]
): Promise<Array<{ path: string; name: string; content: string }>> {
  const files: Array<{ path: string; name: string; content: string }> = []
  for (const root of libraries) {
    try {
      const stat = await fs.stat(root)
      if (!stat.isDirectory()) continue
    } catch {
      continue
    }
    await walk(root, root, libraryId(root), files)
  }
  return files
}

async function walk(
  dir: string,
  root: string,
  id: string,
  files: Array<{ path: string; name: string; content: string }>
): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (dir === root && entry.name === 'assets') continue
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(abs, root, id, files)
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      const content = await fs.readFile(abs, 'utf8')
      files.push({
        path: `${id}/${toPosixRel(root, abs)}`,
        name: entry.name,
        content: isSealed(content) ? '' : content
      })
    }
  }
}
