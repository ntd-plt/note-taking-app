// Conversions between the server's item tree and BlockNote's document.
//
// toBlockNote turns GET /items/:id into the blocks the editor loads. fromBlockNote
// turns the editor's document into a Snapshot: the page's blocks flattened by id,
// each with its parent and ordered children, props holding `content` as the server
// stores it. diffOps compares two Snapshots, so both sides of a diff come from the
// editor (with BlockNote's default props filled in) and never from the server.
import { PROP, isBlockType, pageIcon, pageName } from '#/entities/item'
import type { Item, ItemType, OpenedItem, Props } from '#/entities/item'

// The shape of a BlockNote block, as far as these functions need it. BlockNote's
// own Block type fits it.
export interface BNBlock {
  id: string
  type: string
  props: Record<string, unknown>
  content?: unknown
  children: BNBlock[]
}

export type EditorItemType = Exclude<ItemType, 'workspace'>

export interface SnapshotNode {
  id: string
  type: EditorItemType
  // The page itself for top-level blocks.
  parentId: string
  // Always empty for a child page: its content is not part of this document.
  childIds: string[]
  props: Props
}

export interface Snapshot {
  pageId: string
  rootIds: string[]
  // Every block and child page in the document, keyed by id. The page itself is
  // not included.
  nodes: Map<string, SnapshotNode>
}

export const emptySnapshot = (pageId: string): Snapshot => ({
  pageId,
  rootIds: [],
  nodes: new Map(),
})

export function toBlockNote(opened: OpenedItem): BNBlock[] {
  const page = opened.items.at(0)
  if (!page) return []
  const byId = new Map<string, Item>(opened.items.map((i) => [i.id, i]))
  const build = (id: string): BNBlock[] => {
    const it = byId.get(id)
    if (!it || it.trashedAt) return []
    if (it.type === 'page') {
      return [
        {
          id,
          type: 'page',
          props: { name: pageName(it), icon: pageIcon(it) },
          children: [],
        },
      ]
    }
    if (!isBlockType(it.type)) return []
    const { [PROP.content]: content, ...props } = it.props
    return [
      {
        id,
        type: it.type,
        props,
        content: Array.isArray(content) ? content : [],
        children: it.childIds.flatMap(build),
      },
    ]
  }
  return page.childIds.flatMap(build)
}

export function fromBlockNote(
  pageId: string,
  blocks: readonly BNBlock[],
): Snapshot {
  const nodes = new Map<string, SnapshotNode>()
  const add = (b: BNBlock, node: SnapshotNode) => {
    if (nodes.has(b.id) || b.id === pageId)
      throw new Error(`block id ${b.id} appears twice`)
    nodes.set(b.id, node)
  }
  const walk = (list: readonly BNBlock[], parentId: string): string[] => {
    const ids: string[] = []
    for (const b of list) {
      if (b.type === 'page') {
        add(b, {
          id: b.id,
          type: 'page',
          parentId,
          childIds: [],
          props: { ...b.props },
        })
        ids.push(b.id)
        // A child page is a leaf here. Anything nested under it is lifted out to
        // sit right after it rather than lost.
        ids.push(...walk(b.children, parentId))
        continue
      }
      if (!isBlockType(b.type))
        throw new Error(`unsupported block type "${b.type}"`)
      const node: SnapshotNode = {
        id: b.id,
        type: b.type,
        parentId,
        childIds: [],
        props: { ...b.props, [PROP.content]: b.content ?? [] },
      }
      add(b, node)
      ids.push(b.id)
      node.childIds = walk(b.children, b.id)
    }
    return ids
  }
  return { pageId, rootIds: walk(blocks, pageId), nodes }
}

// childList is a parent's ordered children in a snapshot; empty for an id the
// snapshot does not hold as a parent.
export function childList(s: Snapshot, parentId: string): string[] {
  if (parentId === s.pageId) return s.rootIds
  return s.nodes.get(parentId)?.childIds ?? []
}

// documentOrder lists every node id, parents before children.
export function documentOrder(s: Snapshot): string[] {
  const out: string[] = []
  const walk = (ids: string[]) => {
    for (const id of ids) {
      out.push(id)
      walk(childList(s, id))
    }
  }
  walk(s.rootIds)
  return out
}
