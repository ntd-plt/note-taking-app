import { act, renderHook } from '@testing-library/react'
import type { MouseEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Item } from '#/shared/models'
import { useTreeSelection } from './useTreeSelection'

const item = (
  id: string,
  type: Item['type'],
  parentId: string | null = null,
): Item => ({ id, type, name: id, parentId, icon: '', isFavorite: false })

const items: Item[] = [
  item('Work', 'folder'),
  item('Nested', 'folder', 'Work'),
  item('deep', 'note', 'Nested'),
  item('weekly', 'note', 'Work'),
  item('roadmap', 'note', 'Work'),
  item('Personal', 'folder'),
  item('groceries', 'note', 'Personal'),
  item('inbox', 'note'),
]
const visible = ['Work', 'Personal', 'inbox']

const click = (mods: Partial<MouseEvent> = {}) => mods as MouseEvent

function setup(visibleIds = visible, list = items) {
  const open = vi.fn()
  const hook = renderHook(
    (props: { list: Item[]; visibleIds: string[] }) =>
      useTreeSelection(props.list, props.visibleIds),
    { initialProps: { list, visibleIds } },
  )
  const selected = () => [...hook.result.current.selectedIds].sort()
  const ctrlClick = (id: string) =>
    act(() =>
      hook.result.current.onRowClick(id, click({ ctrlKey: true }), open),
    )
  const shiftClick = (id: string) =>
    act(() =>
      hook.result.current.onRowClick(id, click({ shiftKey: true }), open),
    )
  const plainClick = (id: string) =>
    act(() => hook.result.current.onRowClick(id, click(), open))
  return { hook, open, selected, ctrlClick, shiftClick, plainClick }
}

describe('useTreeSelection', () => {
  it('selects a folder together with everything inside it, even when collapsed', () => {
    const { selected, ctrlClick } = setup()

    ctrlClick('Work')

    expect(selected()).toEqual(
      ['Work', 'Nested', 'deep', 'weekly', 'roadmap'].sort(),
    )
  })

  it('selects a lone note without touching its folder', () => {
    const { selected, ctrlClick } = setup()

    ctrlClick('weekly')

    expect(selected()).toEqual(['weekly'])
  })

  it('deselects a folder and its contents when it is Ctrl-clicked again', () => {
    const { selected, ctrlClick } = setup()
    ctrlClick('Work')
    ctrlClick('inbox')

    ctrlClick('Work')

    expect(selected()).toEqual(['inbox'])
  })

  it('removes an item and the folders above it, but keeps the rest selected', () => {
    const { selected, ctrlClick } = setup()
    ctrlClick('Work')

    ctrlClick('weekly')

    expect(selected()).toEqual(['Nested', 'deep', 'roadmap'].sort())
  })

  it('removes a nested folder with its own contents and every folder above it', () => {
    const { selected, ctrlClick } = setup()
    ctrlClick('Work')

    ctrlClick('Nested')

    expect(selected()).toEqual(['weekly', 'roadmap'].sort())
  })

  it('does not drop the folders of other branches when one item is removed', () => {
    const { selected, ctrlClick } = setup()
    ctrlClick('Work')
    ctrlClick('Personal')

    ctrlClick('weekly')

    expect(selected()).toEqual(
      ['Nested', 'deep', 'roadmap', 'Personal', 'groceries'].sort(),
    )
  })

  it('selects the visible range with Shift-click, including folder contents', () => {
    const { selected, ctrlClick, shiftClick } = setup()
    ctrlClick('Work')

    shiftClick('Personal')

    expect(selected()).toEqual(
      [
        'Work',
        'Nested',
        'deep',
        'weekly',
        'roadmap',
        'Personal',
        'groceries',
      ].sort(),
    )
  })

  it('keeps the selection when a selected folder is collapsed or expanded', () => {
    const { hook, selected, ctrlClick } = setup()
    ctrlClick('Work')
    const before = selected()

    hook.rerender({
      list: items,
      visibleIds: [
        'Work',
        'Nested',
        'deep',
        'weekly',
        'roadmap',
        'Personal',
        'inbox',
      ],
    })
    expect(selected()).toEqual(before)

    hook.rerender({ list: items, visibleIds: ['Work', 'Personal', 'inbox'] })
    expect(selected()).toEqual(before)
  })

  it('clears the selection and opens the row on a plain click', () => {
    const { selected, open, ctrlClick, plainClick } = setup()
    ctrlClick('Work')

    plainClick('inbox')

    expect(selected()).toEqual([])
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('does not open a row on Ctrl-click or Shift-click', () => {
    const { open, ctrlClick, shiftClick } = setup()

    ctrlClick('inbox')
    shiftClick('Personal')

    expect(open).not.toHaveBeenCalled()
  })

  it('replaceWith selects the given items and their contents only', () => {
    const { hook, selected, ctrlClick } = setup()
    ctrlClick('inbox')

    act(() => hook.result.current.replaceWith(['Nested']))

    expect(selected()).toEqual(['Nested', 'deep'].sort())
  })

  it('forgets items that no longer exist', () => {
    const { hook, selected, ctrlClick } = setup()
    ctrlClick('Work')

    hook.rerender({
      list: items.filter((i) => !['weekly', 'roadmap'].includes(i.id)),
      visibleIds: visible,
    })

    expect(selected()).toEqual(['Work', 'Nested', 'deep'].sort())
  })

  it('clears on Escape', () => {
    const { hook, selected, ctrlClick } = setup()
    ctrlClick('Work')
    expect(selected().length).toBeGreaterThan(0)

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })

    expect(hook.result.current.selectedIds.size).toBe(0)
  })
})
