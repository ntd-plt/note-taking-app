import { describe, expect, it } from 'vitest'
import { pageName } from '#/entities/item'
import type { Item } from '#/entities/item'
import { seedTree } from '#/entities/item/api/mockSeed'
import { fromWireItem } from '#/entities/item/api/wire'
import { buildPageTree, favoritePages, visibleRows } from './pageTree'
import type { PageNode } from './pageTree'

const pages = () => seedTree().tree.listPages().map(fromWireItem)

const outline = (nodes: PageNode[]): unknown[] =>
  nodes.map((n) =>
    n.children.length
      ? [pageName(n.item), outline(n.children)]
      : pageName(n.item),
  )

describe('buildPageTree', () => {
  it('nests pages under their parent page, whatever block they sit in', () => {
    expect(outline(buildPageTree(pages()))).toEqual([
      ['Getting Started', ['How this app works']],
      ['Work', [['Website Redesign', ['Design checklist']], 'Weekly sync']],
      ['Personal', ['Reading list']],
      'Ideas inbox',
    ])
  })

  it('records each node depth', () => {
    const [, work] = buildPageTree(pages())
    expect(work.depth).toBe(0)
    expect(work.children[0].children[0].depth).toBe(2)
  })

  it('shows a page whose parent page is missing at the top level', () => {
    const [first] = pages()
    const orphan: Item = { ...first, id: 'orphan', parentPageId: 'gone' }
    expect(buildPageTree([orphan]).map((n) => n.item.id)).toEqual(['orphan'])
  })
})

describe('visibleRows', () => {
  it('lists rows in on-screen order and skips collapsed pages', () => {
    const tree = buildPageTree(pages())
    const work = tree[1].item.id
    const redesign = tree[1].children[0].item.id
    expect(
      visibleRows(tree, new Set([work])).map((n) => pageName(n.item)),
    ).toEqual([
      'Getting Started',
      'Work',
      'Website Redesign',
      'Weekly sync',
      'Personal',
      'Ideas inbox',
    ])
    expect(
      visibleRows(tree, new Set([work, redesign])).map((n) => pageName(n.item)),
    ).toContain('Design checklist')
  })
})

describe('favoritePages', () => {
  it('keeps favorites in document order', () => {
    expect(favoritePages(pages()).map(pageName)).toEqual([
      'Getting Started',
      'Weekly sync',
    ])
  })
})
