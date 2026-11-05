// The sidebar's page tree, built from GET /pages: every page not in the trash, in
// document order, each with its nearest parent page. Blocks between pages are not
// shown, so a page inside a bullet of Work is listed as a child of Work.
import { isFavorite } from '#/entities/item'
import type { Item } from '#/entities/item'

export interface PageNode {
  item: Item
  depth: number
  children: PageNode[]
}

export function buildPageTree(pages: readonly Item[]): PageNode[] {
  const ids = new Set(pages.map((p) => p.id))
  const children = new Map<string | null, Item[]>()
  for (const p of pages) {
    // A parent the list does not hold should not happen; show the page at the
    // top level rather than hide it.
    const parent =
      p.parentPageId !== null && ids.has(p.parentPageId) ? p.parentPageId : null
    children.set(parent, [...(children.get(parent) ?? []), p])
  }
  const seen = new Set<string>()
  const build = (parent: string | null, depth: number): PageNode[] =>
    (children.get(parent) ?? []).flatMap((item) => {
      if (seen.has(item.id)) return []
      seen.add(item.id)
      return [{ item, depth, children: build(item.id, depth + 1) }]
    })
  return build(null, 0)
}

// visibleRows flattens the tree in on-screen order, skipping the children of pages
// that are not expanded.
export function visibleRows(
  tree: readonly PageNode[],
  expanded: ReadonlySet<string>,
): PageNode[] {
  const out: PageNode[] = []
  const walk = (nodes: readonly PageNode[]) => {
    for (const n of nodes) {
      out.push(n)
      if (expanded.has(n.item.id)) walk(n.children)
    }
  }
  walk(tree)
  return out
}

export const favoritePages = (pages: readonly Item[]): Item[] =>
  pages.filter(isFavorite)
