// MSW handlers for the item tree endpoints: GET /items/:id, GET /workspace,
// GET /pages, POST /ops and POST /items/:id/duplicate. The rules live in mockTree.ts.
import { http, HttpResponse } from 'msw'
import { seedTree } from './mockSeed'
import type { SeedNode } from './mockSeed'
import { MockTree, TreeError, validateBatch } from './mockTree'

const API = '/api/v1'

let state = seedTree()

// resetMockTree starts the mocks over from the sample tree, from the given nodes,
// or (empty) from a workspace with nothing in it. It returns the page ids by name.
export function resetMockTree(
  opts: { empty?: boolean; nodes?: SeedNode[] } = {},
) {
  state = opts.empty ? { tree: new MockTree(), ids: {} } : seedTree(opts.nodes)
  return state.ids
}

export const mockTree = () => state.tree
export const mockPageIds = () => state.ids

const fail = (err: unknown) => {
  if (err instanceof TreeError) {
    const body: { error: string; op_index?: number } = { error: err.message }
    if (err.index !== undefined) body.op_index = err.index
    return HttpResponse.json(body, { status: err.status })
  }
  throw err
}

export const itemHandlers = [
  http.get(`${API}/workspace`, () =>
    HttpResponse.json(state.tree.items.get(state.tree.workspaceId)),
  ),

  http.get(`${API}/pages`, () => HttpResponse.json(state.tree.listPages())),

  http.get(`${API}/items/:id`, ({ params }) => {
    try {
      return HttpResponse.json(state.tree.open(params.id as string))
    } catch (err) {
      return fail(err)
    }
  }),

  http.post(`${API}/ops`, async ({ request }) => {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return HttpResponse.json(
        { error: 'invalid request body' },
        { status: 400 },
      )
    }
    try {
      state.tree.apply(validateBatch(body))
      return new HttpResponse(null, { status: 204 })
    } catch (err) {
      return fail(err)
    }
  }),

  http.post(`${API}/items/:id/duplicate`, ({ params }) => {
    try {
      const copy = state.tree.duplicate(params.id as string)
      return HttpResponse.json(copy, { status: 201 })
    } catch (err) {
      return fail(err)
    }
  }),
]
