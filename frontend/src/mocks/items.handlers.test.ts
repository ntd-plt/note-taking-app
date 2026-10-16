import { afterEach, describe, expect, it } from 'vitest'
import * as api from '#/widgets/note-editor/api'
import { nextCloneName, resetMockItems } from './items.handlers'

afterEach(() => resetMockItems())

describe('mock items API', () => {
  it('rejects the same bad requests as the server', async () => {
    const note = await api.createItem({ type: 'note', name: 'N' })
    await expect(
      api.createItem({ type: 'note', name: 'X', parentId: note.id }),
    ).rejects.toThrow('parent must be a folder')
    await expect(
      api.createItem({ type: 'note', name: 'X', parentId: 'missing' }),
    ).rejects.toThrow('parent folder not found')
    await expect(api.createItem({ type: 'note', name: '  ' })).rejects.toThrow(
      'name is required',
    )
    await expect(api.fetchItem('missing')).rejects.toThrow('item not found')
  })

  it('gives content only to notes', async () => {
    const folder = await api.createItem({ type: 'folder', name: 'F' })
    await expect(api.fetchNoteContent(folder.id)).rejects.toThrow(
      'item is not a note',
    )
    await expect(api.saveNoteContent(folder.id, 'x')).rejects.toThrow(
      'item is not a note',
    )
  })

  it('moves atomically: a bad entry leaves every item where it was', async () => {
    const a = await api.createItem({ type: 'folder', name: 'A' })
    const b = await api.createItem({ type: 'note', name: 'B' })
    await expect(
      api.moveItems([
        { id: b.id, parentId: a.id },
        { id: a.id, parentId: b.id },
      ]),
    ).rejects.toThrow('destination must be a folder')
    expect((await api.fetchItem(b.id)).parentId).toBeNull()
  })

  it('refuses a cycle formed by two moves in one request', async () => {
    const a = await api.createItem({ type: 'folder', name: 'A' })
    const b = await api.createItem({ type: 'folder', name: 'B' })
    await expect(
      api.moveItems([
        { id: a.id, parentId: b.id },
        { id: b.id, parentId: a.id },
      ]),
    ).rejects.toThrow(/itself or one of its descendants/)
  })

  it('deletes a folder with its whole subtree and their content', async () => {
    const f = await api.createItem({ type: 'folder', name: 'F' })
    const n = await api.createItem({ type: 'note', name: 'N', parentId: f.id })
    await api.deleteItem(f.id)
    await expect(api.fetchItem(n.id)).rejects.toThrow()
    await expect(api.fetchNoteContent(n.id)).rejects.toThrow()
  })

  it('lists folders first, then by name, without note content', async () => {
    const items = await api.fetchItems()
    const firstNote = items.findIndex((i) => i.type === 'note')
    expect(items.slice(0, firstNote).every((i) => i.type === 'folder')).toBe(
      true,
    )
    expect(items.slice(firstNote).every((i) => i.type === 'note')).toBe(true)
    expect(items[0]).not.toHaveProperty('content')
  })
})

describe('mock trash API', () => {
  it('moves a folder and its subtree out of the tree and back', async () => {
    const f = await api.createItem({ type: 'folder', name: 'F' })
    const n = await api.createItem({ type: 'note', name: 'N', parentId: f.id })
    await api.saveNoteContent(n.id, 'hello')
    await api.updateItem(n.id, { isFavorite: true })

    const trashed = await api.trashItems([f.id])
    expect(trashed.map((t) => t.id).sort()).toEqual([f.id, n.id].sort())
    await expect(api.fetchItem(n.id)).rejects.toThrow('item not found')
    await expect(api.fetchNoteContent(n.id)).rejects.toThrow('item not found')
    expect((await api.fetchTrash()).map((t) => t.id).sort()).toEqual(
      [f.id, n.id].sort(),
    )

    const restored = await api.restoreItems([f.id])
    expect(restored.map((i) => i.id).sort()).toEqual([f.id, n.id].sort())
    const back = await api.fetchItem(n.id)
    expect(back.parentId).toBe(f.id)
    expect(back.isFavorite).toBe(false)
    expect((await api.fetchNoteContent(n.id)).content).toBe('hello')
    expect(await api.fetchTrash()).toEqual([])
  })

  it('restores a child on its own to the top level when its folder is trashed', async () => {
    const f = await api.createItem({ type: 'folder', name: 'F' })
    const n = await api.createItem({ type: 'note', name: 'N', parentId: f.id })
    await api.trashItems([f.id])

    const [restored] = await api.restoreItems([n.id])
    expect(restored.parentId).toBeNull()
    expect((await api.fetchTrash()).map((t) => t.id)).toEqual([f.id])
  })

  it('leaves items trashed in an earlier batch in the trash', async () => {
    const f = await api.createItem({ type: 'folder', name: 'F' })
    const early = await api.createItem({
      type: 'note',
      name: 'Early',
      parentId: f.id,
    })
    await api.trashItems([early.id])
    await api.trashItems([f.id])

    const restored = await api.restoreItems([f.id])
    expect(restored.map((i) => i.id)).toEqual([f.id])
    expect((await api.fetchTrash()).map((t) => t.id)).toEqual([early.id])
  })

  it('rejects the same bad requests as the server', async () => {
    const n = await api.createItem({ type: 'note', name: 'N' })
    await expect(api.trashItems([])).rejects.toThrow('no items given')
    await expect(api.trashItems([n.id, n.id])).rejects.toThrow(
      'listed more than once',
    )
    await expect(api.trashItems([n.id, 'missing'])).rejects.toThrow(
      'item not found',
    )
    await expect(api.restoreItems([n.id])).rejects.toThrow('item not found')
    await expect(api.deleteTrashedItem(n.id)).rejects.toThrow('item not found')
    expect((await api.fetchItem(n.id)).id).toBe(n.id)
  })

  it('does not let a new item reuse a trashed id', async () => {
    const n = await api.createItem({ type: 'note', name: 'N' })
    await api.trashItems([n.id])
    await expect(
      api.createItem({ id: n.id, type: 'note', name: 'Again' }),
    ).rejects.toThrow('item already exists')
  })

  it('deletes a trashed item with the trashed items inside it, and can empty the trash', async () => {
    const f = await api.createItem({ type: 'folder', name: 'F' })
    await api.createItem({ type: 'note', name: 'N', parentId: f.id })
    const other = await api.createItem({ type: 'note', name: 'Other' })
    await api.trashItems([f.id, other.id])

    await api.deleteTrashedItem(f.id)
    expect((await api.fetchTrash()).map((t) => t.id)).toEqual([other.id])

    await api.emptyTrash()
    expect(await api.fetchTrash()).toEqual([])
  })
})

describe('nextCloneName', () => {
  it('takes the smallest unused number', () => {
    const taken = new Set(['Plan', 'Plan (Copy 1)', 'Plan (Copy 3)'])
    expect(nextCloneName('Plan', taken)).toBe('Plan (Copy 2)')
    expect(taken.has('Plan (Copy 2)')).toBe(true)
  })

  it('replaces an existing suffix instead of stacking', () => {
    expect(nextCloneName('Plan (Copy 4)', new Set(['Plan (Copy 4)']))).toBe(
      'Plan (Copy 1)',
    )
  })

  it('truncates the base so the name fits 255 characters', () => {
    const name = nextCloneName('é'.repeat(255), new Set())
    expect([...name]).toHaveLength(255)
    expect(name.endsWith(' (Copy 1)')).toBe(true)
  })
})
