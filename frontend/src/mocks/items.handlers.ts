import { http, HttpResponse } from 'msw'
import type { Item } from '#/shared/models'
import { DEFAULT_ICONS } from '#/shared/models'
import {
  buildChildrenMap,
  compareItems,
  getSubtreeIds,
} from '#/shared/lib/hierarchy'
import initialItems from './initialItems'
import type { SeedItem } from './initialItems'

const API = '/api/v1'

let mockItems: Item[] = []
let mockContents = new Map<string, { content: string; updatedAt: string }>()

export function resetMockItems({ empty = false } = {}) {
  mockItems = []
  mockContents = new Map()
  if (empty) return
  for (const seed of initialItems) {
    const { content, ...item }: SeedItem = seed
    mockItems.push({ ...item })
    if (item.type === 'note') {
      mockContents.set(item.id, {
        content: content ?? '',
        updatedAt: item.updatedAt ?? new Date().toISOString(),
      })
    }
  }
}
resetMockItems()

const MAX_NAME_LENGTH = 255
const COPY_SUFFIX = /^(.*) \(Copy \d+\)$/

export function nextCloneName(name: string, taken: Set<string>): string {
  const match = COPY_SUFFIX.exec(name)
  const base = match && match[1] !== '' ? match[1] : name
  for (let n = 1; ; n++) {
    const suffix = ` (Copy ${n})`
    const room = MAX_NAME_LENGTH - [...suffix].length
    const trimmed = [...base].slice(0, room).join('')
    const candidate = `${trimmed}${suffix}`
    if (!taken.has(candidate)) {
      taken.add(candidate)
      return candidate
    }
  }
}

const toBackendShape = (i: Item) => ({
  id: i.id,
  user_id: 'mock-user',
  parent_id: i.parentId,
  type: i.type,
  name: i.name,
  icon: i.icon,
  is_favorite: i.isFavorite,
  created_at: i.createdAt,
  updated_at: i.updatedAt,
})

const error = (status: number, message: string) =>
  HttpResponse.json({ error: message }, { status })

const find = (id: string) => mockItems.find((i) => i.id === id)

function checkParent(
  parentId: string | null,
  what = 'parent',
): Response | null {
  if (parentId === null) return null
  const parent = find(parentId)
  if (!parent) {
    return error(
      404,
      what === 'parent'
        ? 'parent folder not found'
        : 'destination folder not found',
    )
  }
  if (parent.type !== 'folder') {
    return error(400, `${what} must be a folder`)
  }
  return null
}

function duplicate(sourceId: string) {
  const source = find(sourceId)
  if (!source) return error(404, 'item not found')

  const now = new Date().toISOString()
  const taken = new Set(
    mockItems.filter((i) => i.parentId === source.parentId).map((i) => i.name),
  )
  const children = buildChildrenMap(mockItems)

  const copyOf = (original: Item, parentId: string | null, name: string) => {
    const copy: Item = {
      ...original,
      id: crypto.randomUUID(),
      parentId,
      name,
      createdAt: now,
      updatedAt: now,
    }
    mockItems.push(copy)
    const body = mockContents.get(original.id)
    if (body)
      mockContents.set(copy.id, { content: body.content, updatedAt: now })
    return copy
  }

  const root = copyOf(
    source,
    source.parentId,
    nextCloneName(source.name, taken),
  )
  const queue: Array<[Item, Item]> = [[source, root]]
  while (queue.length > 0) {
    const [from, to] = queue.shift()!
    for (const child of [...(children.get(from.id) ?? [])].sort(compareItems)) {
      const copy = copyOf(child, to.id, child.name)
      if (child.type === 'folder') queue.push([child, copy])
    }
  }
  return HttpResponse.json(toBackendShape(root), { status: 201 })
}

export const itemsHandlers = [
  http.get(`${API}/items`, ({ request }) => {
    const parent = new URL(request.url).searchParams.get('parent_id')
    let items = [...mockItems]
    if (parent !== null) {
      const parentId = parent === 'null' ? null : parent
      const missing = checkParent(parentId)
      if (missing) return missing
      items = items.filter((i) => i.parentId === parentId)
    }
    return HttpResponse.json(items.sort(compareItems).map(toBackendShape))
  }),

  http.get(`${API}/items/:id`, ({ params }) => {
    const item = find(params.id as string)
    if (!item) return error(404, 'item not found')
    return HttpResponse.json(toBackendShape(item))
  }),

  http.post(`${API}/items`, async ({ request }) => {
    const cloneFromId = new URL(request.url).searchParams.get('cloneFromId')
    if (cloneFromId !== null) return duplicate(cloneFromId)

    const body = (await request.json()) as any
    if (body.type !== 'note' && body.type !== 'folder') {
      return error(400, 'type must be "note" or "folder"')
    }
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (name === '') return error(400, 'name is required')
    const missing = checkParent(body.parent_id ?? null)
    if (missing) return missing
    if (body.id && find(body.id)) return error(409, 'item already exists')

    const now = new Date().toISOString()
    const item: Item = {
      id: body.id || crypto.randomUUID(),
      type: body.type,
      name,
      parentId: body.parent_id ?? null,
      icon: body.icon || DEFAULT_ICONS[body.type as Item['type']],
      isFavorite: body.is_favorite ?? false,
      createdAt: now,
      updatedAt: now,
    }
    mockItems.push(item)
    if (item.type === 'note') {
      mockContents.set(item.id, { content: body.content ?? '', updatedAt: now })
    }
    return HttpResponse.json(toBackendShape(item), { status: 201 })
  }),

  http.patch(`${API}/items`, async ({ request }) => {
    const body = (await request.json()) as {
      items?: Array<{ id: string; parent_id: string | null }>
    }
    const moves = body.items ?? []
    if (moves.length === 0) return error(400, 'no items to move')

    for (const move of moves) {
      if (!find(move.id)) return error(404, 'item not found')
      const missing = checkParent(move.parent_id, 'destination')
      if (missing) return missing
    }

    const parentOf = new Map(mockItems.map((i) => [i.id, i.parentId]))
    for (const move of moves) parentOf.set(move.id, move.parent_id)
    for (const move of moves) {
      const seen = new Set<string>()
      for (
        let cur = move.parent_id;
        cur !== null;
        cur = parentOf.get(cur) ?? null
      ) {
        if (cur === move.id || seen.has(cur)) {
          return error(
            400,
            'cannot move a folder into itself or one of its descendants',
          )
        }
        seen.add(cur)
      }
    }

    const now = new Date().toISOString()
    const result = moves.map((move) => {
      const item = find(move.id)!
      if (item.parentId !== move.parent_id) {
        item.parentId = move.parent_id
        item.updatedAt = now
      }
      return toBackendShape(item)
    })
    return HttpResponse.json(result)
  }),

  http.patch(`${API}/items/:id`, async ({ params, request }) => {
    const item = find(params.id as string)
    if (!item) return error(404, 'item not found')
    const body = (await request.json()) as any
    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (name === '') return error(400, 'name is required')
      item.name = name
    }
    if (body.icon !== undefined)
      item.icon = body.icon || DEFAULT_ICONS[item.type]
    if (body.is_favorite !== undefined) item.isFavorite = body.is_favorite
    item.updatedAt = new Date().toISOString()
    return HttpResponse.json(toBackendShape(item))
  }),

  http.delete(`${API}/items/:id`, ({ params }) => {
    const id = params.id as string
    if (!find(id)) return error(404, 'item not found')
    const doomed = getSubtreeIds([id], buildChildrenMap(mockItems))
    mockItems = mockItems.filter((i) => !doomed.has(i.id))
    for (const goneId of doomed) mockContents.delete(goneId)
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(`${API}/items/:id/content`, ({ params }) => {
    const id = params.id as string
    const item = find(id)
    if (!item) return error(404, 'item not found')
    if (item.type !== 'note') return error(400, 'item is not a note')
    const body = mockContents.get(id) ?? {
      content: '',
      updatedAt: item.updatedAt,
    }
    return HttpResponse.json({
      item_id: id,
      content: body.content,
      updated_at: body.updatedAt,
    })
  }),

  http.put(`${API}/items/:id/content`, async ({ params, request }) => {
    const id = params.id as string
    const item = find(id)
    if (!item) return error(404, 'item not found')
    if (item.type !== 'note') return error(400, 'item is not a note')
    const body = (await request.json()) as { content?: string }
    if (typeof body.content !== 'string')
      return error(400, 'content is required')
    const now = new Date().toISOString()
    mockContents.set(id, { content: body.content, updatedAt: now })
    item.updatedAt = now
    return HttpResponse.json({
      item_id: id,
      content: body.content,
      updated_at: now,
    })
  }),
]
