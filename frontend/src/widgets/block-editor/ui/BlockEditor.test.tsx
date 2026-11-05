import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Toaster } from 'sonner'
import type { Op } from '#/entities/item'
import { seedTree } from '#/entities/item/api/mockSeed'
import { fromWireOpenedItem, toWireOp } from '#/entities/item/api/wire'
import type { WireItem } from '#/entities/item/api/wire'
import type { PageEditor } from '../model/schema'
import { BlockEditor } from './BlockEditor'
import { applyDrop, measure } from './DragLayer'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    to: _to,
    ...rest
  }: {
    children: ReactNode
    params: { itemId: string }
    to: string
  }) => (
    <a href={`/items/${params.itemId}`} {...rest}>
      {children}
    </a>
  ),
}))

afterEach(cleanup)

const textOf = (x: WireItem | undefined) =>
  ((x?.props?.content as { text: string }[] | undefined) ?? [])
    .map((r) => r.text)
    .join('')

async function setup(pageName = 'Work', fail = false) {
  const { tree, ids } = seedTree()
  const pageId = ids[pageName]
  const sent: Op[][] = []
  const send = vi.fn(async (ops: Op[]) => {
    sent.push(ops)
    if (fail) throw new Error('rejected')
    tree.apply(ops.map(toWireOp))
  })
  const onSaveFailed = vi.fn()
  let editor: PageEditor | undefined
  render(
    <>
      <Toaster />
      <BlockEditor
        opened={fromWireOpenedItem(tree.open(pageId))}
        editable
        send={send}
        onSaveFailed={onSaveFailed}
        onSavingChange={() => {}}
        onReady={(e) => (editor = e)}
      />
    </>,
  )
  await waitFor(() => expect(editor).toBeDefined())
  const childTexts = (id: string) =>
    (tree.items.get(id)?.child_ids ?? []).map((c) => {
      const x = tree.items.get(c)
      return x?.type === 'page' ? `[${String(x.props?.name)}]` : textOf(x)
    })
  return {
    tree,
    ids,
    pageId,
    editor: editor!,
    send,
    sent,
    onSaveFailed,
    childTexts,
  }
}

const SAVED = { timeout: 3000 }

describe('BlockEditor', () => {
  it('shows the page blocks and its child pages', async () => {
    await setup()
    expect(await screen.findByText('Projects and meetings.')).toBeTruthy()
    const link = screen.getByText('Website Redesign').closest('a')
    expect(link?.getAttribute('href')).toMatch(/^\/items\//)
  })

  it('saves only the edited block, a second after the edit', async () => {
    const s = await setup()
    const first = s.editor.document[0]
    act(() => {
      s.editor.updateBlock(first, {
        content: [{ type: 'text', text: 'Edited', styles: {} }],
      })
    })
    expect(s.send).not.toHaveBeenCalled()
    await waitFor(() => expect(s.send).toHaveBeenCalled(), SAVED)
    expect(s.sent).toEqual([
      [
        {
          op: 'update',
          id: first.id,
          props: { content: [{ type: 'text', text: 'Edited', styles: {} }] },
        },
      ],
    ])
    expect(s.childTexts(s.pageId)[0]).toBe('Edited')
  })

  it('saves a dragged block as one move', async () => {
    const s = await setup()
    const [first, , meetings] = s.editor.document
    act(() =>
      applyDrop(s.editor, first.id, {
        kind: 'gap',
        parentId: null,
        afterId: meetings.id,
        level: 0,
        lineBelowId: meetings.id,
      }),
    )
    await waitFor(() => expect(s.send).toHaveBeenCalled(), SAVED)
    expect(s.sent).toEqual([
      [{ op: 'move', id: first.id, parentId: s.pageId, position: 2 }],
    ])
    expect(s.childTexts(s.pageId)).toEqual([
      '[Website Redesign]',
      'Meetings',
      'Projects and meetings.',
      '',
    ])
  })

  it('nests a block dropped onto another as its last child', async () => {
    const s = await setup()
    const [first, , meetings] = s.editor.document
    act(() =>
      applyDrop(s.editor, first.id, { kind: 'nest', targetId: meetings.id }),
    )
    await waitFor(() => expect(s.send).toHaveBeenCalled(), SAVED)
    expect(s.childTexts(meetings.id)).toEqual([
      '[Weekly sync]',
      'Projects and meetings.',
    ])
  })

  it('offers Undo for a child page removed in the editor, back at the end of its parent', async () => {
    const s = await setup()
    const [first, redesign, meetings, tail] = s.editor.document
    act(() => s.editor.removeBlocks([redesign]))
    await waitFor(
      () => expect(s.tree.items.get(redesign.id)?.trashed_at).toBeTruthy(),
      SAVED,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    // At the end of the page, before the trailing empty paragraph.
    expect(s.editor.document.map((b) => b.id)).toEqual([
      first.id,
      meetings.id,
      redesign.id,
      tail.id,
    ])
    await waitFor(
      () => expect(s.tree.items.get(redesign.id)?.trashed_at).toBeFalsy(),
      SAVED,
    )
    expect(s.sent.at(-1)).toEqual([
      { op: 'restore', id: redesign.id, parentId: s.pageId, position: 2 },
    ])
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull(),
    )
  })

  it('puts a child page back as the last child of the block it was in', async () => {
    const s = await setup()
    const meetings = s.editor.document[2]
    const weekly = meetings.children[0]
    act(() => {
      s.editor.insertBlocks(
        [{ type: 'paragraph', content: 'after' }],
        weekly,
        'after',
      )
      s.editor.removeBlocks([weekly])
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }, SAVED))
    expect(
      s.editor
        .getBlock(meetings.id)!
        .children.map((b) => b.id)
        .at(-1),
    ).toBe(weekly.id)
  })

  it('shows one toast, for the latest removal', async () => {
    const s = await setup()
    const [, redesign] = s.editor.document
    act(() => s.editor.removeBlocks([redesign]))
    expect(
      await screen.findByText(/Moved "Website Redesign"/, {}, SAVED),
    ).toBeTruthy()
    const weekly = s.editor.document[1].children[0]
    act(() => s.editor.removeBlocks([weekly]))
    expect(
      await screen.findByText(/Moved "Weekly sync"/, {}, SAVED),
    ).toBeTruthy()
    await waitFor(() =>
      expect(screen.queryByText(/Moved "Website Redesign"/)).toBeNull(),
    )
    expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(1)
  })

  it('reports a rejected save', async () => {
    const s = await setup('Work', true)
    act(() => {
      s.editor.updateBlock(s.editor.document[0], {
        content: [{ type: 'text', text: 'x', styles: {} }],
      })
    })
    await waitFor(() => expect(s.onSaveFailed).toHaveBeenCalled(), SAVED)
  })

  it('measures rows with depth, parent and child pages', async () => {
    const s = await setup()
    const root = s.editor.domElement!
    let i = 0
    const spy = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: Element) {
        if (!this.classList.contains('bn-block-content'))
          return new DOMRect(0, 0, 600, 0)
        const n = i++
        const depth = this.closest('.bn-block-group .bn-block-group') ? 1 : 0
        return new DOMRect(100 + depth * 24, n * 30, 500, 30)
      })
    const layout = measure(root)
    spy.mockRestore()
    expect(
      layout.rows.map((r) => [r.depth, r.isPage, r.parentId !== null]),
    ).toEqual([
      [0, false, false], // Projects and meetings.
      [0, true, false], // Website Redesign
      [0, false, false], // Meetings
      [1, true, true], // Weekly sync
      [0, false, false], // trailing paragraph
    ])
    expect(layout.indent).toBe(24)
    expect(layout.originX).toBe(100)
  })
})
