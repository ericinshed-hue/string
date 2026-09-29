import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  assertInside,
  imageVaultPath,
  isReservedRel,
  normalizePosix,
  relativeLink,
  rewriteMarkdownLinks,
  vaultUrlFromPosix
} from '../src/shared/paths.ts'
import { deleteToTrash, listTrash, listTree, readNote, restoreTrash, saveImage, writeNote } from '../src/main/vault.ts'

describe('paths', () => {
  it('rejects paths that leave the zone', () => {
    const root = path.resolve('C:/notes/Note')
    assert.throws(() => assertInside(root, path.resolve('C:/notes/Routine/a.md')))
    assert.equal(assertInside(root, path.resolve('C:/notes/Note/a.md')), path.resolve('C:/notes/Note/a.md'))
  })

  it('normalizes relative image paths inside the vault', () => {
    assert.equal(imageVaultPath('note', '2026/09/a.md', '../../assets/图.png'), 'Note/assets/图.png')
    assert.equal(imageVaultPath('note', 'a.md', '../Routine/secret.md'), null)
    assert.equal(imageVaultPath('routine', 'day.md', 'https://example.com/a.png'), null)
    assert.equal(isReservedRel('assets/a.png'), true)
    assert.equal(isReservedRel('.trash/1'), true)
    assert.equal(normalizePosix('a/../b'), 'b')
  })

  it('builds a vault url and rewrites links after a move', () => {
    assert.equal(vaultUrlFromPosix('Note/assets/a b.png'), 'vault://asset/Note/assets/a%20b.png')
    const oldFile = path.join('C:/vault/Note', 'a.md')
    const newFile = path.join('C:/vault/Note/2026', 'a.md')
    const asset = path.join('C:/vault/Note/assets', 'pic.png')
    const content = `![图](${relativeLink(oldFile, asset)})`
    const next = rewriteMarkdownLinks(content, oldFile, newFile)
    assert.match(next, /\]\(\.\.\/assets\/pic\.png\)/)
  })
})

describe('vault', () => {
  it('writes, hides assets and trash, and restores a deleted note', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'routine-notes-'))
    try {
      await writeNote(root, 'routine', 'week/today.md', '买菜\n')
      await saveImage(root, 'routine', 'week/today.md', 'pic.png', Buffer.from('img'))
      const text = await readNote(root, 'routine', 'week/today.md')
      assert.match(text, /买菜/)
      const saved = await readNote(root, 'routine', 'week/today.md')
      assert.equal(saved, '买菜\n')
      const tree = await listTree(root, 'routine')
      assert.equal(tree.some((node) => node.name === 'assets' || node.name === '.trash'), false)
      assert.equal(tree[0]?.name, 'week')
      const imageRel = await saveImage(root, 'routine', 'week/today.md', 'pic.png', Buffer.from('img'))
      await writeNote(root, 'routine', 'week/today.md', `看图\n\n![](${imageRel})\n`)
      const withImage = await readNote(root, 'routine', 'week/today.md')
      assert.match(withImage, /assets\/.*pic\.png/)
      await deleteToTrash(root, 'routine', 'week/today.md')
      await assert.rejects(() => readNote(root, 'routine', 'week/today.md'))
      const trash = await listTrash(root, 'routine')
      assert.equal(trash.length, 1)
      assert.equal(trash[0]?.originalRelativePath, 'week/today.md')
      await restoreTrash(root, 'routine', trash[0]!.id)
      assert.match(await readNote(root, 'routine', 'week/today.md'), /看图/)
      await assert.rejects(() => writeNote(root, 'routine', '../Note/nope.md', 'x'))
      await assert.rejects(() => writeNote(root, 'routine', 'assets/nope.md', 'x'))
      const assetStat = await stat(path.join(root, 'Routine', 'assets'))
      assert.equal(assetStat.isDirectory(), true)
      await mkdir(path.join(root, 'Note', 'assets'), { recursive: true })
      await writeFile(path.join(root, 'Note', 'secret.md'), 'night', 'utf8')
      await assert.rejects(() => readNote(root, 'routine', '../Note/secret.md'))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
