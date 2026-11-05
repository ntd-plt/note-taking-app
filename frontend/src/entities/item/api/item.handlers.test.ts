import { afterEach, describe, expect, it } from 'vitest'
import { ApiError } from '#/shared/api/client'
import {
  applyOps,
  changesPages,
  duplicateItem,
  fetchItem,
  fetchPages,
  fetchWorkspace,
  opIndex,
  pageName,
} from '#/entities/item'
import type { Item, Op } from '#/entities/item'
import { mockPageIds, mockTree, resetMockTree } from './item.handlers'

afterEach(() => resetMockTree())

const id = () => crypto.randomUUID()
const text = (s: string) => [{ type: 'text', text: s, styles: {} }]
const ws = () => mockTree().workspaceId

const createPage = (pid: string, parent: string, name: string): Op => ({
  op: 'create',
  id: pid,
  type: 'page',
  parentId: parent,
  props: { name },
})
const createPara = (
  bid: string,
  parent: string,
  s: string,
  position?: number,
): Op => ({
  op: 'create',
  id: bid,
  type: 'paragraph',
  parentId: parent,
  position,
  props: { content: text(s) },
})

const ids = (items: Item[]) => items.map((x) => x.id)
const childIds = async (pageId: string, of = pageId) =>
  (await fetchItem(pageId)).items.find((x) => x.id === of)!.childIds

// rejects applies ops, wants the given status at op index, and checks nothing
// changed.
async function rejects(ops: Op[], status: number, index?: number) {
  const before = structuredClone([...mockTree().items])
  const err = await applyOps(ops).catch((e: unknown) => e)
  expect(err).toBeInstanceOf(ApiError)
  expect((err as ApiError).status).toBe(status)
  expect(opIndex(err)).toBe(index)
  expect([...mockTree().items]).toEqual(before)
  return err as ApiError
}

// A fresh page: Page > [a, b > [b1], c]
async function samplePage() {
  resetMockTree({ empty: true })
  const page = id()
  const [a, b, b1, c] = [id(), id(), id(), id()]
  await applyOps([
    createPage(page, ws(), 'Page'),
    createPara(a, page, 'a'),
    { ...createPara(b, page, 'b'), type: 'bulletListItem' } as Op,
    createPara(b1, b, 'b1'),
    createPara(c, page, 'c'),
  ])
  return { page, a, b, b1, c }
}

describe('reading the sample tree', () => {
  it('lists pages in document order with their parents', async () => {
    const pages = await fetchPages()
    expect(pages.map(pageName)).toEqual([
      'Getting Started',
      'How this app works',
      'Work',
      'Website Redesign',
      'Design checklist',
      'Weekly sync',
      'Personal',
      'Reading list',
      'Ideas inbox',
    ])
    const by = Object.fromEntries(pages.map((p) => [pageName(p), p]))
    expect(by['Getting Started'].parentId).toBe(ws())
    expect(by['Getting Started'].parentPageId).toBeNull()
    expect(by['Weekly sync'].parentPageId).toBe(mockPageIds()['Work'])
    expect(by['Weekly sync'].parentId).not.toBe(mockPageIds()['Work']) // a bullet
    expect(by['Getting Started'].props.is_favorite).toBe(true)
  })

  it('opens a page with its blocks in order, not going into child pages', async () => {
    const opened = await fetchItem(mockPageIds()['Website Redesign'])
    expect(opened.items[0].id).toBe(mockPageIds()['Website Redesign'])
    expect(opened.items.map((x) => x.type)).toEqual([
      'page',
      'heading',
      'bulletListItem',
      'page',
      'paragraph',
    ])
    expect(opened.items[1].props).toMatchObject({ level: 2 })
    expect(opened.ancestors.map(pageName)).toEqual(['Work'])
    expect(opened.focusId).toBeNull()
    expect(opened.inTrash).toBe(false)
    // Every page ends with an empty paragraph.
    expect(opened.items.at(-1)!.props.content).toEqual([])
  })

  it('opens a block as its page, focused on the block', async () => {
    const page = (await fetchItem(mockPageIds()['Reading list'])).items
    const block = page[1]
    const opened = await fetchItem(block.id)
    expect(opened.items[0].id).toBe(mockPageIds()['Reading list'])
    expect(opened.focusId).toBe(block.id)
    expect(opened.ancestors.map(pageName)).toEqual(['Personal'])
  })

  it('returns the workspace, even with no pages', async () => {
    resetMockTree({ empty: true })
    const w = await fetchWorkspace()
    expect(w.id).toBe(ws())
    expect(w.type).toBe('workspace')
    expect(w.childIds).toEqual([])
  })

  it('does not open the workspace', async () => {
    await expect(fetchItem(ws())).rejects.toMatchObject({ status: 404 })
  })
})

describe('applying operations', () => {
  it('creates at positions, fills props, and positions see earlier ops', async () => {
    const { page, a, b, c } = await samplePage()
    const [first, mid] = [id(), id()]
    await applyOps([
      createPara(first, page, 'first', 0),
      createPara(mid, page, 'mid', 3),
    ])
    expect(await childIds(page)).toEqual([first, a, b, mid, c])

    const check = id()
    await applyOps([
      { op: 'create', id: check, type: 'checkListItem', parentId: page },
    ])
    const item = (await fetchItem(check)).items.find((x) => x.id === check)!
    expect(item.props).toEqual({ content: [], checked: false })
  })

  it('creates pages with defaults', async () => {
    resetMockTree({ empty: true })
    const page = id()
    await applyOps([{ op: 'create', id: page, type: 'page', parentId: ws() }])
    expect((await fetchItem(page)).items[0].props).toEqual({
      name: 'New Page',
      icon: '📄',
      is_favorite: false,
    })
  })

  it('merges props on update, ignoring nulls and bad values', async () => {
    const { page, a } = await samplePage()
    await applyOps([
      {
        op: 'update',
        id: page,
        props: { name: 'Renamed', icon: null, is_favorite: 'yes' },
      },
      { op: 'update', id: a, props: { textColor: 'red' } },
    ])
    const opened = await fetchItem(page)
    expect(opened.items[0].props).toEqual({
      name: 'Renamed',
      icon: '📄',
      is_favorite: false,
    })
    expect(opened.items[1].props).toEqual({
      content: text('a'),
      textColor: 'red',
    })
  })

  it('turns a block into another type and keeps its text', async () => {
    const { page, a } = await samplePage()
    await applyOps([
      { op: 'update', id: a, type: 'heading', props: { level: 2 } },
    ])
    const turned = (await fetchItem(page)).items[1]
    expect(turned.type).toBe('heading')
    expect(turned.props).toEqual({ content: text('a'), level: 2 })
  })

  it('moves within a parent to the final index and nests', async () => {
    const { page, a, b, b1, c } = await samplePage()
    await applyOps([{ op: 'move', id: a, parentId: page, position: 2 }])
    expect(await childIds(page)).toEqual([b, c, a])
    await applyOps([{ op: 'move', id: c, parentId: b }])
    expect(await childIds(page)).toEqual([b, a])
    expect(await childIds(page, b)).toEqual([b1, c])
  })

  it('deletes a block for good, sending pages inside it to the trash', async () => {
    const { page, b, b1 } = await samplePage()
    const child = id()
    await applyOps([createPage(child, b1, 'Child')])
    await applyOps([{ op: 'delete', id: b }])

    expect(await childIds(page)).not.toContain(b)
    await expect(fetchItem(b1)).rejects.toMatchObject({ status: 404 })
    expect((await fetchPages()).map(pageName)).toEqual(['Page'])
    const trashed = await fetchItem(child)
    expect(trashed.inTrash).toBe(true)
    expect(trashed.items[0].parentId).toBe(ws())
  })

  it('lets undo re-create a deleted block with the same id', async () => {
    const { page, a, b, c } = await samplePage()
    await applyOps([{ op: 'delete', id: a }])
    await applyOps([createPara(a, page, 'a', 0)])
    expect(await childIds(page)).toEqual([a, b, c])
  })

  it('trashes a page with everything inside it', async () => {
    const { page } = await samplePage()
    const child = id()
    await applyOps([createPage(child, page, 'Child')])
    await applyOps([{ op: 'trash', id: page }])
    expect(await fetchPages()).toEqual([])
    expect((await fetchItem(child)).inTrash).toBe(true)
  })

  it('puts a page added at the end of a page before its trailing empty paragraph', async () => {
    const opened = await fetchItem(mockPageIds()['Ideas inbox'])
    const [pageItem, intro, trailing] = opened.items
    const [child, moved] = [id(), mockPageIds()['Reading list']]
    await applyOps([
      createPage(child, pageItem.id, 'Child'),
      { op: 'move', id: moved, parentId: pageItem.id },
    ])
    expect(await childIds(pageItem.id)).toEqual([
      intro.id,
      child,
      moved,
      trailing.id,
    ])

    // A block still goes last.
    const block = id()
    await applyOps([createPara(block, pageItem.id, 'last')])
    expect((await childIds(pageItem.id)).at(-1)).toBe(block)
  })
})

describe('rejected batches change nothing', () => {
  it('rejects bad operations with the server statuses and op_index', async () => {
    const { page, a, b, b1 } = await samplePage()
    const err = await rejects(
      [createPara(id(), page, 'fine'), createPara(id(), ws(), 'top level')],
      400,
      1,
    )
    expect(err.message).toBe('only pages can be at the top level')

    await rejects([createPara(id(), page, 'x', 9)], 409, 0)
    await rejects([{ op: 'move', id: b, parentId: b1 }], 409, 0)
    await rejects([{ op: 'delete', id: page }], 400, 0)
    await rejects([{ op: 'trash', id: a }], 400, 0)
    await rejects([{ op: 'update', id: a, type: 'page' }], 400, 0)
    await rejects([{ op: 'update', id: a, type: 'heading' }], 400, 0)
    await rejects([{ op: 'update', id: id(), props: { x: 1 } }], 404, 0)
    await rejects([createPara(a, page, 'again')], 409, 0)
    await rejects(
      [
        {
          op: 'create',
          id: id(),
          type: 'codeBlock' as 'quote',
          parentId: page,
        },
      ],
      400,
      0,
    )
    await rejects([createPara(id(), page, 'x'.repeat(70 * 1024))], 413, 0)
  })

  it('rejects changes inside a trashed page', async () => {
    const { page, a } = await samplePage()
    await applyOps([{ op: 'trash', id: page }])
    await rejects(
      [{ op: 'update', id: a, props: { textColor: 'red' } }],
      409,
      0,
    )
    await rejects([createPara(id(), a, 'x')], 409, 0)
  })

  it('rejects empty and oversized batches', async () => {
    await samplePage()
    await rejects([], 400)
    const ops = Array.from({ length: 501 }, () => createPara(id(), ws(), 'x'))
    await rejects(ops, 413)
  })
})

describe('duplicating', () => {
  it('copies a page after the original with new ids, as a non-favorite copy', async () => {
    const original = mockPageIds()['Getting Started']
    const copy = await duplicateItem(original)
    expect(pageName(copy)).toBe('Getting Started (Copy 1)')
    expect(copy.props.is_favorite).toBe(false)

    const pages = (await fetchPages()).filter((p) => p.parentId === ws())
    expect(ids(pages).slice(0, 2)).toEqual([original, copy.id])

    const before = (await fetchItem(original)).items
    const after = (await fetchItem(copy.id)).items
    expect(after.map((x) => x.type)).toEqual(before.map((x) => x.type))
    expect(ids(after).some((x) => ids(before).includes(x))).toBe(false)

    const again = await duplicateItem(original)
    expect(pageName(again)).toBe('Getting Started (Copy 2)')
  })
})

describe('changesPages', () => {
  it('flags batches that can change the sidebar on their own', () => {
    expect(changesPages([{ op: 'trash', id: 'x' }])).toBe(true)
    expect(changesPages([{ op: 'delete', id: 'x' }])).toBe(true)
    expect(
      changesPages([{ op: 'create', id: 'x', type: 'page', parentId: 'p' }]),
    ).toBe(true)
    expect(
      changesPages([
        { op: 'create', id: 'x', type: 'paragraph', parentId: 'p' },
        { op: 'update', id: 'x', props: { content: [] } },
        { op: 'move', id: 'x', parentId: 'p' },
      ]),
    ).toBe(false)
  })
})
