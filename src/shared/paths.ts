import path from 'path'
import { imageVaultPath, normalizePosix, vaultUrlFromPosix, zoneFolder } from './url'

export { imageVaultPath, normalizePosix, vaultUrlFromPosix, zoneFolder }

export function assertInside(root: string, target: string): string {
  const rootResolved = path.resolve(root)
  const targetResolved = path.resolve(target)
  const rel = path.relative(rootResolved, targetResolved)
  if (rel === '') return targetResolved
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('That path is outside the allowed folder')
  }
  return targetResolved
}

export function toPosixRel(root: string, target: string): string {
  return path.relative(path.resolve(root), path.resolve(target)).split(path.sep).join('/')
}

export function isReservedRel(rel: string): boolean {
  const normalized = normalizePosix(rel)
  if (normalized === null) return true
  return normalized === 'assets' || normalized.startsWith('assets/') || normalized === '.trash' || normalized.startsWith('.trash/')
}

export function relativeLink(fromFile: string, toFile: string): string {
  let rel = path.relative(path.dirname(fromFile), toFile).split(path.sep).join('/')
  if (!rel.startsWith('.')) rel = `./${rel}`
  return rel
}

export function rewriteMarkdownLinks(content: string, oldFile: string, newFile: string): string {
  const oldDir = path.dirname(oldFile)
  const newDir = path.dirname(newFile)
  return content.replace(/(!?\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?)\)/g, (full, prefix, url, title) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) return full
    const abs = path.resolve(oldDir, url)
    const next = relativeLink(path.join(newDir, 'note.md'), abs)
    return `${prefix}${next}${title})`
  })
}
