// The sample workspace the mocks start with, in the spirit of the backend's
// cmd/seeduser/sample_tree.json: every block type, child pages under a page and
// under a block, and two levels of nesting. It is created through MockTree.apply,
// so the seed obeys the same rules as any batch.
import type { BlockType, Props } from '../model/types'
import type { WireOp } from './wire'
import { MockTree } from './mockTree'

interface SeedNode {
  type: 'page' | BlockType
  props?: Props
  text?: string
  children?: SeedNode[]
}

const page = (
  name: string,
  icon: string,
  children: SeedNode[] = [],
  isFavorite = false,
): SeedNode => ({
  type: 'page',
  props: { name, icon, is_favorite: isFavorite },
  children,
})
const block = (
  type: BlockType,
  text: string,
  children?: SeedNode[],
  props?: Props,
): SeedNode => ({ type, text, children, props })
const p = (text: string, children?: SeedNode[]) =>
  block('paragraph', text, children)
const h = (level: 1 | 2 | 3, text: string) =>
  block('heading', text, undefined, { level })
const bullet = (text: string, children?: SeedNode[]) =>
  block('bulletListItem', text, children)

export const SAMPLE_TREE: SeedNode[] = [
  page(
    'Getting Started',
    '🚀',
    [
      h(1, 'Welcome 👋'),
      p('Everything here is a block, and pages can live inside any block.'),
      h(2, 'Block types'),
      bullet('Bullet lists'),
      bullet('Every block can have children', [bullet('Like this one')]),
      block('numberedListItem', 'Numbered lists'),
      block('numberedListItem', 'Count on their own'),
      block('checkListItem', 'Try the side menu', undefined, {
        checked: true,
      }),
      block('checkListItem', 'Drag a block with ⋮⋮'),
      block('toggleListItem', 'Toggles hide their children', [
        page('How this app works', '📘', [p('A child page inside a toggle.')]),
      ]),
      block('quote', 'Pages hold blocks; blocks can hold pages.'),
    ],
    true,
  ),
  page('Work', '💼', [
    p('Projects and meetings.'),
    page('Website Redesign', '🎨', [
      h(2, 'Goals'),
      bullet('Faster pages'),
      page('Design checklist', '✅', [
        block('checkListItem', 'Colors'),
        block('checkListItem', 'Typography'),
      ]),
    ]),
    bullet('Meetings', [
      page('Weekly sync', '📅', [p('Notes from the weekly sync.')], true),
    ]),
  ]),
  page('Personal', '🏡', [
    page('Reading list', '📚', [bullet('A book'), bullet('Another book')]),
  ]),
  page('Ideas inbox', '💡', [p('Write ideas down before they fly away.')]),
]

const textContent = (text: string) =>
  text === '' ? [] : [{ type: 'text', text, styles: {} }]

// seedOps turns nodes into create operations, parents before children, each
// appended to its parent. Every page ends with an empty paragraph, as the editor
// keeps one there. ids maps each page name to its id.
function seedOps(
  parent: string,
  nodes: SeedNode[],
  ops: WireOp[],
  ids: Record<string, string>,
) {
  for (const n of nodes) {
    const id = crypto.randomUUID()
    const props: Props = { ...n.props }
    if (n.type !== 'page') props.content = textContent(n.text ?? '')
    else ids[String(props.name)] = id
    ops.push({ op: 'create', id, type: n.type, parent_id: parent, props })
    seedOps(id, n.children ?? [], ops, ids)
    if (n.type === 'page') {
      ops.push({
        op: 'create',
        id: crypto.randomUUID(),
        type: 'paragraph',
        parent_id: id,
        props: { content: [] },
      })
    }
  }
}

export function seedTree(nodes: SeedNode[] = SAMPLE_TREE) {
  const tree = new MockTree()
  const ids: Record<string, string> = {}
  const ops: WireOp[] = []
  seedOps(tree.workspaceId, nodes, ops, ids)
  if (ops.length > 0) tree.apply(ops, '2026-10-01T10:00:00.000Z')
  return { tree, ids }
}

export type { SeedNode }
