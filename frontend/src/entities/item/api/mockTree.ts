// An in-memory item tree for the MSW mocks. It follows the server's rules
// (backend/internal/tree and services/ops_service.go) so the app behaves the same
// against the mocks as against the real backend: same checks, same error statuses,
// all-or-nothing batches. It works on the wire shapes, as the server does.
import { BLOCK_TYPES } from '../model/types'
import type { ItemType, Props } from '../model/types'
import type { WireItem, WireOp } from './wire'

export const MAX_TREE_DEPTH = 256
export const MAX_PROPS_BYTES = 64 * 1024
export const MAX_OPS_PER_BATCH = 500
export const MAX_DUPLICATE_ROWS = 1000
const MAX_NAME_LENGTH = 255
const MAX_ICON_LENGTH = 32

// TreeError is a rejected request. index is the failing operation, when there is one.
export class TreeError extends Error {
  constructor(
    public status: number,
    message: string,
    public index?: number,
  ) {
    super(message)
  }
}

const runeCount = (s: string) => [...s].length
const byteSize = (v: unknown) =>
  new TextEncoder().encode(JSON.stringify(v)).length

// ---- Props, as in backend/internal/model/props.go ----

interface PropRule {
  key: string
  // Returns the value to store, or ok false when it is not acceptable.
  check: (v: unknown) => { value: unknown; ok: boolean }
  // Missing means the key is required.
  def?: () => unknown
}

const checkName = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim() : ''
  return {
    value: s,
    ok: typeof v === 'string' && s !== '' && runeCount(s) <= MAX_NAME_LENGTH,
  }
}
const checkIcon = (v: unknown) => ({
  value: v,
  ok: typeof v === 'string' && v !== '' && runeCount(v) <= MAX_ICON_LENGTH,
})
const checkBool = (v: unknown) => ({ value: v, ok: typeof v === 'boolean' })
const checkList = (v: unknown) => ({ value: v, ok: Array.isArray(v) })
const checkLevel = (v: unknown) => ({
  value: v,
  ok: v === 1 || v === 2 || v === 3,
})

const contentRule: PropRule = {
  key: 'content',
  check: checkList,
  def: () => [],
}

function propRules(t: ItemType): PropRule[] {
  switch (t) {
    case 'page':
      return [
        { key: 'name', check: checkName, def: () => 'New Page' },
        { key: 'icon', check: checkIcon, def: () => '📄' },
        { key: 'is_favorite', check: checkBool, def: () => false },
      ]
    case 'heading':
      return [contentRule, { key: 'level', check: checkLevel }]
    case 'checkListItem':
      return [
        contentRule,
        { key: 'checked', check: checkBool, def: () => false },
      ]
    case 'workspace':
      return []
    default:
      return [contentRule]
  }
}

const validType = (t: unknown): t is ItemType =>
  t === 'workspace' ||
  t === 'page' ||
  (BLOCK_TYPES as readonly unknown[]).includes(t)

// ---- Request validation, as in services/ops_service.go ----

const OP_FIELDS = new Set([
  'op',
  'id',
  'type',
  'parent_id',
  'position',
  'props',
])

export function validateBatch(body: unknown): WireOp[] {
  const ops = (body as { ops?: unknown } | null)?.ops
  if (!Array.isArray(ops)) {
    throw new TreeError(400, 'invalid request body: ops must be a list')
  }
  if (ops.length === 0) throw new TreeError(400, 'ops must not be empty')
  if (ops.length > MAX_OPS_PER_BATCH) {
    throw new TreeError(
      413,
      `at most ${MAX_OPS_PER_BATCH} operations per batch`,
    )
  }
  ops.forEach((op, i) => validateOp(i, op))
  return ops as WireOp[]
}

function validateOp(i: number, raw: unknown) {
  const bad = (msg: string) => new TreeError(400, msg, i)
  if (typeof raw !== 'object' || raw === null) throw bad('invalid operation')
  for (const k of Object.keys(raw)) {
    if (!OP_FIELDS.has(k)) {
      throw new TreeError(400, `invalid request body: unknown field "${k}"`)
    }
  }
  const op = raw as WireOp
  if (!op.id) throw bad('id is required')
  if (op.type !== undefined && (op.type === 'workspace' || !validType(op.type)))
    throw bad(`unknown type ${op.type}`)
  if (op.position !== undefined && op.position < 0)
    throw bad('position cannot be negative')
  if (op.props !== undefined && byteSize(op.props) > MAX_PROPS_BYTES) {
    throw new TreeError(413, 'props must be at most 64 KB', i)
  }
  const placed = op.parent_id !== undefined || op.position !== undefined
  switch (op.op) {
    case 'create':
      if (op.type === undefined || op.parent_id === undefined)
        throw bad('create needs type and parent_id')
      return
    case 'update':
      if (placed) throw bad('use move to change where an item is')
      if (op.type === undefined && op.props === undefined)
        throw bad('update needs type or props')
      return
    case 'move':
      if (op.parent_id === undefined) throw bad('move needs parent_id')
      if (op.type !== undefined || op.props !== undefined)
        throw bad('move only changes where an item is')
      return
    case 'delete':
    case 'trash':
      if (op.type !== undefined || op.props !== undefined || placed)
        throw bad(`${op.op} takes only an id`)
      return
    case 'restore':
      if (op.type !== undefined || op.props !== undefined)
        throw bad('restore only takes an id, parent_id and position')
      return
    default:
      throw bad(
        'op must be one of create, update, move, delete, trash, restore',
      )
  }
}

// ---- The tree ----

export class MockTree {
  items = new Map<string, WireItem>()
  readonly workspaceId: string

  constructor() {
    const now = new Date().toISOString()
    this.workspaceId = crypto.randomUUID()
    this.items.set(this.workspaceId, {
      id: this.workspaceId,
      parent_id: null,
      type: 'workspace',
      child_ids: [],
      props: {},
      created_at: now,
      updated_at: now,
    })
  }

  has(id: string) {
    return this.items.has(id)
  }

  // apply runs a validated batch in order, each op seeing the ones before it, and
  // keeps the result only if every op succeeds.
  apply(ops: WireOp[], now = new Date().toISOString()) {
    const e = new Engine(this, now)
    ops.forEach((op, i) => {
      e.index = i
      e.run(op)
    })
    e.finish()
    this.items = e.items
  }

  duplicate(id: string, now = new Date().toISOString()): WireItem {
    const e = new Engine(this, now)
    const root = e.duplicate(id)
    e.finish()
    this.items = e.items
    return root
  }

  // ---- Reads, as in database/postgre_items_datasource.go ----

  // children returns a parent's children ordered by its child_ids; children it does
  // not list come last, by creation time.
  private children(parent: WireItem): WireItem[] {
    const ids = parent.child_ids ?? []
    const rank = (it: WireItem) => {
      const i = ids.indexOf(it.id)
      return i === -1 ? ids.length : i
    }
    return [...this.items.values()]
      .filter((it) => it.parent_id === parent.id)
      .sort(
        (a, b) =>
          rank(a) - rank(b) ||
          a.created_at.localeCompare(b.created_at) ||
          a.id.localeCompare(b.id),
      )
  }

  open(id: string) {
    let it = this.items.get(id)
    if (!it || it.type === 'workspace')
      throw new TreeError(404, 'item not found')
    const requested = it
    let page: WireItem | undefined
    let inTrash = false
    for (let depth = 0; it && depth <= MAX_TREE_DEPTH; depth++) {
      if (it.trashed_at) inTrash = true
      if (it.type === 'page' && !page) page = it
      it = it.parent_id ? this.items.get(it.parent_id) : undefined
    }
    if (!page) throw new TreeError(404, 'item not found')

    const items = [page]
    const walk = (parent: WireItem, depth: number) => {
      if (depth >= MAX_TREE_DEPTH) return
      for (const c of this.children(parent)) {
        if (c.trashed_at) continue
        items.push(c)
        if (c.type !== 'page') walk(c, depth + 1)
      }
    }
    walk(page, 0)

    const ancestors: WireItem[] = []
    for (
      let p = page.parent_id ? this.items.get(page.parent_id) : undefined;
      p;
      p = p.parent_id ? this.items.get(p.parent_id) : undefined
    ) {
      if (p.type === 'page') ancestors.unshift(p)
    }

    return {
      items,
      ancestors,
      focus_id: requested.type === 'page' ? null : requested.id,
      in_trash: inTrash,
    }
  }

  // trashed lists the pages in the trash, most recently trashed first. Pages
  // inside a trashed page are not stamped, so they are not listed.
  trashed(): WireItem[] {
    return [...this.items.values()]
      .filter((it) => it.type === 'page' && it.trashed_at)
      .sort((a, b) => b.trashed_at!.localeCompare(a.trashed_at!))
  }

  // deleteFromTrash removes a page in the trash, and everything in it, for good.
  deleteFromTrash(id: string) {
    if (!this.trashed().some((p) => p.id === id))
      throw new TreeError(404, 'page is not in the trash')
    const gone = new Set([id])
    for (let grew = true; grew; ) {
      grew = false
      for (const it of this.items.values()) {
        if (it.parent_id && gone.has(it.parent_id) && !gone.has(it.id)) {
          gone.add(it.id)
          grew = true
        }
      }
    }
    const items = new Map(this.items)
    for (const g of gone) items.delete(g)
    this.items = items
  }

  // emptyTrash removes the pages trashed before `before` (all of them when it is
  // left out) and returns how many.
  emptyTrash(before?: string): number {
    const pages = this.trashed().filter(
      (p) => before === undefined || p.trashed_at! < before,
    )
    for (const p of pages) this.deleteFromTrash(p.id)
    return pages.length
  }

  listPages(): WireItem[] {
    const pages: WireItem[] = []
    const walk = (
      parent: WireItem,
      parentPage: string | null,
      depth: number,
    ) => {
      if (depth >= MAX_TREE_DEPTH) return
      for (const c of this.children(parent)) {
        if (c.trashed_at) continue
        let next = parentPage
        if (c.type === 'page') {
          const row: WireItem = { ...c }
          if (parentPage) row.parent_page_id = parentPage
          pages.push(row)
          next = c.id
        }
        walk(c, next, depth + 1)
      }
    }
    walk(this.items.get(this.workspaceId)!, null, 0)
    return pages
  }
}

// Engine applies operations to a copy of the tree, as tree.Apply does inside a
// transaction. Items are replaced, never changed in place, so the copy is cheap.
class Engine {
  items: Map<string, WireItem>
  index = 0
  private touched = new Set<string>()
  private ws: WireItem

  constructor(
    tree: MockTree,
    private now: string,
  ) {
    this.items = new Map(tree.items)
    this.ws = this.items.get(tree.workspaceId)!
  }

  private fail(status: number, msg: string): never {
    throw new TreeError(status, msg, this.index)
  }

  run(op: WireOp) {
    switch (op.op) {
      case 'create':
        return this.create(op)
      case 'update':
        return this.update(op)
      case 'move':
        return this.move(op)
      case 'delete':
        return this.delete(op)
      case 'trash':
        return this.trash(op)
      case 'restore':
        return this.restore(op)
      default:
        this.fail(400, `unknown op "${op.op}"`)
    }
  }

  // get returns an item other than the workspace.
  private get(id: string, what: string): WireItem {
    if (id === this.ws.id) this.fail(404, `${what} not found`)
    return this.getAny(id, what)
  }

  private getAny(id: string, what: string): WireItem {
    const it = this.items.get(id)
    if (!it) this.fail(404, `${what} not found`)
    return it
  }

  private save(it: WireItem) {
    this.items.set(it.id, it)
  }

  // chain returns the ids from it up to the workspace. It fails if any of them is
  // in the trash, or if the chain is too long.
  private chain(it: WireItem): string[] {
    const ids = [it.id]
    while (it.parent_id) {
      if (it.trashed_at) this.fail(409, 'item is in the trash')
      if (ids.length > MAX_TREE_DEPTH)
        this.fail(400, 'items are nested too deeply')
      it = this.getAny(it.parent_id, 'parent')
      ids.push(it.id)
    }
    return ids
  }

  private parentFor(parentId: string | undefined, type: ItemType): string[] {
    if (!parentId) this.fail(400, 'parent_id is required')
    const parent = this.getAny(parentId, 'parent')
    if (parent.id === this.ws.id && type !== 'page') {
      this.fail(400, 'only pages can be at the top level')
    }
    const chain = this.chain(parent)
    if (chain.length >= MAX_TREE_DEPTH)
      this.fail(400, 'items are nested too deeply')
    return chain
  }

  private detach(parentId: string, id: string) {
    const parent = this.getAny(parentId, 'parent')
    this.save({
      ...parent,
      child_ids: (parent.child_ids ?? []).filter((c) => c !== id),
    })
    this.touched.add(parentId)
  }

  // attach puts id at index position of the parent's child_ids, counted without id
  // itself, or at the end. A page added at the end of a page goes before that
  // page's trailing empty paragraph.
  private attach(parentId: string, id: string, position?: number) {
    const parent = this.getAny(parentId, 'parent')
    const ids = (parent.child_ids ?? []).filter((c) => c !== id)
    let at = ids.length
    if (position !== undefined) {
      if (position < 0 || position > ids.length) {
        this.fail(
          409,
          `position ${position} is out of range: the parent has ${ids.length} other children`,
        )
      }
      at = position
    } else if (parent.type === 'page' && ids.length > 0) {
      const child = this.getAny(id, 'item')
      const last = this.getAny(ids[ids.length - 1], 'child')
      if (child.type === 'page' && isEmptyParagraph(last)) at--
    }
    ids.splice(at, 0, id)
    this.save({ ...parent, child_ids: ids })
    this.touched.add(parentId)
  }

  private completeProps(type: ItemType, props: Props | undefined): Props {
    const out: Props = { ...(props ?? {}) }
    for (const rule of propRules(type)) {
      const { value, ok } = rule.check(out[rule.key])
      if (ok) {
        out[rule.key] = value
        continue
      }
      if (!rule.def) this.fail(400, `${type} needs a valid "${rule.key}"`)
      out[rule.key] = rule.def()
    }
    if (byteSize(out) > MAX_PROPS_BYTES)
      this.fail(400, 'props must be at most 64 KB')
    return out
  }

  private create(op: WireOp) {
    const type = op.type as ItemType | undefined
    if (!type || type === 'workspace' || !validType(type)) {
      this.fail(400, 'a valid type is required')
    }
    this.parentFor(op.parent_id, type)
    if (this.items.has(op.id)) this.fail(409, `item ${op.id} already exists`)
    const props = this.completeProps(type, op.props)
    this.save({
      id: op.id,
      parent_id: op.parent_id!,
      type,
      child_ids: [],
      props,
      created_at: this.now,
      updated_at: this.now,
    })
    this.attach(op.parent_id!, op.id, op.position)
  }

  private update(op: WireOp) {
    const it = this.get(op.id, 'item')
    this.chain(it)
    let type = it.type
    if (op.type !== undefined) {
      if ((op.type === 'page') !== (it.type === 'page')) {
        this.fail(400, 'an item cannot change between page and block')
      }
      type = op.type as ItemType
    }
    const props = this.completeProps(
      type,
      mergeProps(type, it.props ?? {}, op.props ?? {}),
    )
    this.save({ ...it, type, props, updated_at: this.now })
  }

  private move(op: WireOp) {
    const it = this.get(op.id, 'item')
    this.chain(it)
    const parentChain = this.parentFor(op.parent_id, it.type)
    if (parentChain.includes(it.id)) {
      this.fail(409, 'an item cannot be moved inside itself')
    }
    this.detach(it.parent_id!, it.id)
    this.attach(op.parent_id!, it.id, op.position)
    this.save({ ...this.items.get(it.id)!, parent_id: op.parent_id! })
  }

  private descendants(id: string): WireItem[] {
    const out: WireItem[] = []
    for (const queue = [id]; queue.length > 0; ) {
      const parent = queue.shift()!
      for (const it of this.items.values()) {
        if (it.parent_id === parent) {
          out.push(it)
          queue.push(it.id)
        }
      }
    }
    return out
  }

  // delete removes a block and everything under it. Pages under it go to the
  // trash, taking their own content with them.
  private delete(op: WireOp) {
    const it = this.get(op.id, 'item')
    if (it.type === 'page') {
      this.fail(400, 'pages cannot be deleted here; trash them instead')
    }
    this.chain(it)
    const children = new Map<string, WireItem[]>()
    for (const d of this.descendants(it.id)) {
      const list = children.get(d.parent_id!) ?? []
      list.push(d)
      children.set(d.parent_id!, list)
    }
    const removed = [it.id]
    for (const queue = [it.id]; queue.length > 0; ) {
      for (const c of children.get(queue.shift()!) ?? []) {
        if (c.type === 'page') {
          this.toTrash(c)
          continue
        }
        removed.push(c.id)
        queue.push(c.id)
      }
    }
    this.detach(it.parent_id!, it.id)
    for (const id of removed) {
      this.items.delete(id)
      this.touched.delete(id)
    }
  }

  // toTrash moves a page under the workspace and stamps it, leaving it out of the
  // workspace's child_ids.
  private toTrash(page: WireItem) {
    this.save({ ...page, parent_id: this.ws.id, trashed_at: this.now })
  }

  private trash(op: WireOp) {
    const it = this.get(op.id, 'item')
    if (it.type !== 'page') {
      this.fail(400, 'only pages go to the trash; delete blocks instead')
    }
    this.chain(it)
    this.detach(it.parent_id!, it.id)
    this.toTrash(this.items.get(it.id)!)
  }

  // restore takes a page out of the trash and puts it under parent_id at
  // position, or at the end of the workspace. The new parent must not be in the
  // trash, which also rules out a place inside the page itself.
  private restore(op: WireOp) {
    const it = this.get(op.id, 'item')
    if (it.type !== 'page') {
      this.fail(400, 'only pages are restored from the trash')
    }
    if (!it.trashed_at) {
      try {
        this.chain(it)
      } catch {
        this.fail(
          409,
          'this page is inside a page in the trash; restore that page instead',
        )
      }
      this.fail(409, 'page is not in the trash')
    }
    const parentId = op.parent_id ?? this.ws.id
    this.parentFor(parentId, 'page')
    this.save({ ...it, parent_id: parentId, trashed_at: null })
    this.attach(parentId, it.id, op.position)
  }

  // duplicate deep-copies an item and everything under it with new ids, and
  // places the copy right after the original.
  duplicate(id: string): WireItem {
    const src = this.get(id, 'item')
    this.chain(src)
    const below = this.descendants(src.id)
    if (below.length + 1 > MAX_DUPLICATE_ROWS) {
      this.fail(
        400,
        `cannot duplicate more than ${MAX_DUPLICATE_ROWS} items at once`,
      )
    }
    const newIds = new Map<string, string>([[src.id, crypto.randomUUID()]])
    const byId = new Map<string, WireItem>([[src.id, src]])
    for (const d of below) {
      newIds.set(d.id, crypto.randomUUID())
      byId.set(d.id, d)
    }
    const clone = (it: WireItem, parent: string): WireItem => {
      const props: Props = { ...(it.props ?? {}) }
      if (it.type === 'page') props.is_favorite = false
      return {
        ...it,
        id: newIds.get(it.id)!,
        parent_id: parent,
        trashed_at: undefined,
        child_ids: (it.child_ids ?? [])
          .map((c) => newIds.get(c))
          .filter((c): c is string => c !== undefined),
        props,
        created_at: this.now,
        updated_at: this.now,
      }
    }

    const parent = this.getAny(src.parent_id!, 'parent')
    const root = clone(src, parent.id)
    if (root.type === 'page') {
      const occupied = new Set<string>()
      for (const sib of parent.child_ids ?? []) {
        const it = this.items.get(sib)
        if (it?.type === 'page') occupied.add(String(it.props?.name ?? ''))
      }
      root.props!.name = cloneName(String(src.props?.name ?? ''), occupied)
    }

    const copies = [root]
    for (const queue = [src]; queue.length > 0; ) {
      const from = queue.shift()!
      for (const child of from.child_ids ?? []) {
        const it = byId.get(child)
        if (!it) continue
        copies.push(clone(it, newIds.get(from.id)!))
        queue.push(it)
      }
    }
    for (const c of copies) {
      this.save(c)
      if ((c.child_ids ?? []).length > 0) this.touched.add(c.id)
    }
    this.attach(
      parent.id,
      root.id,
      (parent.child_ids ?? []).indexOf(src.id) + 1,
    )
    return this.items.get(root.id)!
  }

  // finish checks that every changed parent's child_ids lists exactly its children
  // that are not in the trash, as the server does before committing.
  finish() {
    for (const id of this.touched) {
      const parent = this.items.get(id)
      if (!parent) continue
      const want = [...this.items.values()]
        .filter((it) => it.parent_id === id && !it.trashed_at)
        .map((it) => it.id)
        .sort()
      const got = [...(parent.child_ids ?? [])].sort()
      if (want.join() !== got.join()) {
        throw new TreeError(
          500,
          `child_ids out of step with children for ${id}`,
        )
      }
    }
  }
}

function isEmptyParagraph(it: WireItem): boolean {
  if (it.type !== 'paragraph' || (it.child_ids ?? []).length > 0) return false
  const content = it.props?.content
  return content == null || (Array.isArray(content) && content.length === 0)
}

// mergeProps sets each given key on a copy of current. A null value is skipped,
// and so is a value the type relies on that is not acceptable for that key.
function mergeProps(type: ItemType, current: Props, changes: Props): Props {
  const rules = new Map(propRules(type).map((r) => [r.key, r]))
  const out: Props = { ...current }
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === undefined) continue
    const rule = rules.get(k)
    if (rule) {
      const { value, ok } = rule.check(v)
      if (!ok) continue
      out[k] = value
      continue
    }
    out[k] = v
  }
  return out
}

const COPY_SUFFIX = /^(.*) \(Copy \d+\)$/

// cloneName returns the smallest "base (Copy N)" not in occupied, with the base
// shortened so the whole name fits.
export function cloneName(name: string, occupied: Set<string>): string {
  const m = COPY_SUFFIX.exec(name)
  const base = m && m[1] !== '' ? m[1] : name
  for (let n = 1; ; n++) {
    const suffix = ` (Copy ${n})`
    const room = MAX_NAME_LENGTH - runeCount(suffix)
    const candidate = [...base].slice(0, room).join('') + suffix
    if (!occupied.has(candidate)) return candidate
  }
}
