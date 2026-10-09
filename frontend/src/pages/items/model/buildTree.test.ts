import { describe, expect, it, vi } from 'vitest'
import type { Item } from '#/shared/models'
import { buildTree } from './buildTree'

const item = (
  id: string,
  type: Item['type'],
  parentId: string | null = null,
  name = id,
): Item => ({ id, type, name, parentId, icon: '', isFavorite: false })

describe('buildTree', () => {
  const items = [
    item('z-note', 'note'),
    item('B', 'folder'),
    item('inner-note', 'note', 'B'),
    item('a-note', 'note'),
    item('inner-folder', 'folder', 'B'),
    item('A', 'folder'),
  ]

  it('nests items under their folder, folders first and then by name', () => {
    const tree = buildTree(items, {})
    expect(tree.map((r) => r.id)).toEqual(['A', 'B', 'a-note', 'z-note'])
    expect(tree[1].children.map((r) => r.id)).toEqual([
      'inner-folder',
      'inner-note',
    ])
  })

  it('marks only expanded folders as expanded', () => {
    const tree = buildTree(items, { B: true, 'a-note': true })
    expect(tree.find((r) => r.id === 'B')?.isExpanded).toBe(true)
    expect(tree.find((r) => r.id === 'A')?.isExpanded).toBe(false)
    expect(tree.find((r) => r.id === 'a-note')?.isExpanded).toBe(false)
  })

  it('leaves out items that cannot be reached from the top level', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken = [
      item('x', 'folder', 'y'),
      item('y', 'folder', 'x'),
      item('orphan', 'note', 'missing'),
      item('ok', 'note'),
    ]
    expect(buildTree(broken, {}).map((r) => r.id)).toEqual(['ok'])
    warn.mockRestore()
  })
})
