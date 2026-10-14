import { mkdtemp, rm, stat } from 'node:fs/promises'
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
import { libraryId } from '../src/shared/library.ts'
import { deleteToTrash, listTrash, listTree, readNote, restoreTrash, saveImage, writeNote } from '../src/main/vault.ts'

describe('paths', () => {
  it('rejects paths that leave the zone', () => {
    const root = path.resolve('C:/notes/Note')
    assert.throws(() => assertInside(root, path.resolve('C:/notes/Routine/a.md')))
    assert.equal(assertInside(root, path.resolve('C:/notes/Note/a.md')), path.resolve('C:/notes/Note/a.md'))
  })

  it('normalizes relative image paths inside the vault', () => {
    assert.equal(imageVaultPath('abc1234567/2026/09/a.md', '../../assets/图.png'), 'abc1234567/assets/图.png')
    assert.equal(imageVaultPath('abc1234567/a.md', '../secret.md'), null)
    assert.equal(imageVaultPath('abc1234567/day.md', 'https://example.com/a.png'), null)
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
      const libs = [root]
      const note = `${libraryId(root)}/week/today.md`
      await writeNote(libs, note, '买菜\n')
      await saveImage(libs, note, 'pic.png', Buffer.from('img'))
      const text = await readNote(libs, note)
      assert.match(text, /买菜/)
      const saved = await readNote(libs, note)
      assert.equal(saved, '买菜\n')
      const tree = await listTree(libs)
      assert.equal(tree.some((node) => node.name === 'assets' || node.name === '.trash'), false)
      assert.equal(tree[0]?.name, 'week')
      const imageRel = await saveImage(libs, note, 'pic.png', Buffer.from('img'))
      await writeNote(libs, note, `看图\n\n![](${imageRel})\n`)
      const withImage = await readNote(libs, note)
      assert.match(withImage, /assets\/.*pic\.png/)
      await deleteToTrash(libs, note)
      await assert.rejects(() => readNote(libs, note))
      const trash = await listTrash(libs)
      assert.equal(trash.length, 1)
      assert.equal(trash[0]?.originalRelativePath, note)
      await restoreTrash(libs, trash[0]!.id)
      assert.match(await readNote(libs, note), /看图/)
      await assert.rejects(() => writeNote(libs, `${libraryId(root)}/../nope.md`, 'x'))
      await assert.rejects(() => writeNote(libs, `${libraryId(root)}/assets/nope.md`, 'x'))
      const assetStat = await stat(path.join(root, 'assets'))
      assert.equal(assetStat.isDirectory(), true)
      const other = await mkdtemp(path.join(tmpdir(), 'routine-notes-'))
      try {
        await writeNote([other], 'week/other.md', 'night')
        const merged = await listTree([root, other])
        assert.equal(merged.filter((node) => node.name.startsWith('week')).length, 2)
        assert.equal(merged.every((node) => node.name.includes('(')), true)
      } finally {
        await rm(other, { recursive: true, force: true })
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
