import { describe, expect, it } from 'vitest'
import type { Item, OpenedItem } from '#/entities/item'
import { fromBlockNote, toBlockNote } from './blocks'
import type { BNBlock } from './blocks'

const at = '2026-10-01T10:00:00.000Z'
const item = (
  id: string,
  type: Item['type'],
  parentId: string,
  childIds: string[] = [],
  props: Item['props'] = {},
): Item => ({
  id,
  type,
  parentId,
  parentPageId: null,
  childIds,
  props,
  trashedAt: null,
  createdAt: at,
  updatedAt: at,
})

const text = (t: string) => [{ type: 'text', text: t, styles: {} }]

const opened: OpenedItem = {
  items: [
    item('page', 'page', 'ws', ['h', 'list', 'child', 'tail'], {
      name: 'Doc',
      icon: '📄',
    }),
    item('h', 'heading', 'page', [], { level: 2, content: text('Title') }),
    item('list', 'bulletListItem', 'page', ['nested'], {
      content: text('Item'),
      textColor: 'red',
    }),
    item('nested', 'checkListItem', 'list', [], {
      checked: true,
      content: text('Done'),
    }),
    item('child', 'page', 'page', ['hidden'], { name: 'Child', icon: '🎨' }),
    item('tail', 'paragraph', 'page', [], { content: [] }),
  ],
  ancestors: [],
  focusId: null,
  inTrash: false,
}

describe('toBlockNote', () => {
  it('nests blocks by childIds and splits content out of props', () => {
    expect(toBlockNote(opened)).toEqual([
      {
        id: 'h',
        type: 'heading',
        props: { level: 2 },
        content: text('Title'),
        children: [],
      },
      {
        id: 'list',
        type: 'bulletListItem',
        props: { textColor: 'red' },
        content: text('Item'),
        children: [
          {
            id: 'nested',
            type: 'checkListItem',
            props: { checked: true },
            content: text('Done'),
            children: [],
          },
        ],
      },
      {
        id: 'child',
        type: 'page',
        props: { name: 'Child', icon: '🎨' },
        children: [],
      },
      {
        id: 'tail',
        type: 'paragraph',
        props: {},
        content: [],
        children: [],
      },
    ])
  })

  it('treats a missing or malformed content as empty', () => {
    const doc = toBlockNote({
      ...opened,
      items: [
        item('page', 'page', 'ws', ['a']),
        item('a', 'paragraph', 'page', [], { content: 'oops' }),
      ],
    })
    expect(doc[0].content).toEqual([])
  })

  it('shows a child page with the default name and icon when it has none', () => {
    const doc = toBlockNote({
      ...opened,
      items: [item('page', 'page', 'ws', ['c']), item('c', 'page', 'page')],
    })
    expect(doc[0].props).toEqual({ name: 'New Page', icon: '📄' })
  })

  it('skips ids it was not given', () => {
    const doc = toBlockNote({
      ...opened,
      items: [item('page', 'page', 'ws', ['gone'])],
    })
    expect(doc).toEqual([])
  })
})

describe('fromBlockNote', () => {
  it('flattens the document and puts content back into props', () => {
    const snap = fromBlockNote('page', toBlockNote(opened))
    expect(snap.pageId).toBe('page')
    expect(snap.rootIds).toEqual(['h', 'list', 'child', 'tail'])
    expect(snap.nodes.get('list')).toEqual({
      id: 'list',
      type: 'bulletListItem',
      parentId: 'page',
      childIds: ['nested'],
      props: { textColor: 'red', content: text('Item') },
    })
    expect(snap.nodes.get('nested')?.parentId).toBe('list')
    // The props round-trip to exactly what the server sent.
    for (const x of opened.items.slice(1)) {
      if (x.type !== 'page')
        expect(snap.nodes.get(x.id)?.props).toEqual(x.props)
    }
  })

  it('keeps a child page as a leaf, without its content', () => {
    const snap = fromBlockNote('page', toBlockNote(opened))
    expect(snap.nodes.get('child')).toEqual({
      id: 'child',
      type: 'page',
      parentId: 'page',
      childIds: [],
      props: { name: 'Child', icon: '🎨' },
    })
  })

  it('lifts blocks nested under a page block out to sit right after it', () => {
    const doc: BNBlock[] = [
      {
        id: 'p',
        type: 'page',
        props: {},
        children: [
          { id: 'x', type: 'paragraph', props: {}, content: [], children: [] },
        ],
      },
      { id: 'y', type: 'paragraph', props: {}, content: [], children: [] },
    ]
    const snap = fromBlockNote('page', doc)
    expect(snap.rootIds).toEqual(['p', 'x', 'y'])
    expect(snap.nodes.get('x')?.parentId).toBe('page')
  })

  it('rejects block types the server does not know', () => {
    expect(() =>
      fromBlockNote('page', [
        { id: 'i', type: 'image', props: {}, children: [] },
      ]),
    ).toThrow(/image/)
  })

  it('rejects a duplicated id', () => {
    const b: BNBlock = {
      id: 'a',
      type: 'paragraph',
      props: {},
      content: [],
      children: [],
    }
    expect(() => fromBlockNote('page', [b, b])).toThrow(/a/)
  })
})
