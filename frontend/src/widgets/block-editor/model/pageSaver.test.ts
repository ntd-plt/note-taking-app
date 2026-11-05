import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Op } from '#/entities/item'
import { fromBlockNote } from './blocks'
import type { BNBlock } from './blocks'
import { PageSaver } from './pageSaver'

const p = (id: string, text = id, children: BNBlock[] = []): BNBlock => ({
  id,
  type: 'paragraph',
  props: {},
  content: [{ type: 'text', text, styles: {} }],
  children,
})
const page = (id: string): BNBlock => ({
  id,
  type: 'page',
  props: { name: id, icon: '📄' },
  children: [],
})

function setup(doc: BNBlock[], send = vi.fn(async () => {})) {
  let current = doc
  const onError = vi.fn()
  const saver = new PageSaver({
    saved: fromBlockNote('pg', doc),
    read: () => fromBlockNote('pg', current),
    send,
    onError,
  })
  return {
    saver,
    send,
    onError,
    edit: (next: BNBlock[]) => {
      current = next
      saver.schedule()
    },
  }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('PageSaver', () => {
  it('saves one second after the last change', async () => {
    const s = setup([p('a')])
    s.edit([p('a', 'x')])
    await vi.advanceTimersByTimeAsync(600)
    s.edit([p('a', 'xy')])
    await vi.advanceTimersByTimeAsync(600)
    expect(s.send).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(400)
    expect(s.send).toHaveBeenCalledTimes(1)
    expect(s.send.mock.calls[0]).toEqual([
      [
        {
          op: 'update',
          id: 'a',
          props: { content: [{ type: 'text', text: 'xy', styles: {} }] },
        },
      ],
      false,
    ])
  })

  it('diffs against what was last saved, and sends nothing when nothing changed', async () => {
    const s = setup([p('a')])
    s.edit([p('a', 'x')])
    await s.saver.flush()
    await s.saver.flush()
    s.edit([p('a', 'x'), p('b')])
    await s.saver.flush()
    expect(s.send).toHaveBeenCalledTimes(2)
    expect((s.send.mock.calls[1] as unknown[])[0]).toMatchObject([
      { op: 'create', id: 'b', position: 1 },
    ])
  })

  it('asks for a sidebar refresh when a page block is created, moved or removed', async () => {
    const s = setup([p('a'), page('c')])
    s.edit([page('c'), p('a')])
    await s.saver.flush()
    expect(s.send.mock.calls[0]).toEqual([
      [{ op: 'move', id: 'c', parentId: 'pg', position: 0 }],
      true,
    ])
  })

  it('splits a long diff into batches of 500, in order', async () => {
    const many = Array.from({ length: 1201 }, (_, i) => p(`b${i}`))
    const s = setup([])
    s.edit(many)
    await s.saver.flush()
    expect(s.send.mock.calls.map((c) => (c as unknown[][])[0].length)).toEqual([
      500, 500, 201,
    ])
  })

  it('stops after a failed save and reports it', async () => {
    const send = vi.fn(async () => {
      throw new Error('nope')
    })
    const s = setup([p('a')], send)
    s.edit([p('a', 'x')])
    await s.saver.flush()
    expect(s.onError).toHaveBeenCalledTimes(1)
    s.edit([p('a', 'y')])
    await vi.advanceTimersByTimeAsync(2000)
    await s.saver.flush()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('sends a block moved into a child page as a move, not a delete', async () => {
    const s = setup([p('a', 'a', [p('a1')]), page('c')])
    s.saver.moveOut('a', 'c')
    s.edit([page('c')])
    await s.saver.flush()
    const ops = (s.send.mock.calls[0] as unknown[])[0] as Op[]
    expect(ops).toEqual([{ op: 'move', id: 'a', parentId: 'c' }])
  })
})
