import { ApiError, rawApiClient } from '#/shared/api/client'
import type { Item, OpenedItem, Op, TrashedPage } from '../model/types'
import {
  fromWireItem,
  fromWireOpenedItem,
  fromWireTrash,
  toWireOp,
} from './wire'
import type { WireItem, WireOpenedItem, WireTrash } from './wire'

const API = '/api/v1'

export const fetchItem = async (id: string): Promise<OpenedItem> =>
  fromWireOpenedItem(
    await rawApiClient.get<WireOpenedItem>(
      `${API}/items/${encodeURIComponent(id)}`,
    ),
  )

export const fetchWorkspace = async (): Promise<Item> =>
  fromWireItem(await rawApiClient.get<WireItem>(`${API}/workspace`))

export const fetchPages = async (): Promise<Item[]> =>
  (await rawApiClient.get<WireItem[]>(`${API}/pages`)).map(fromWireItem)

// applyOps sends one batch; it is applied all-or-nothing. A rejection is an
// ApiError, and opIndex tells which operation failed.
export const applyOps = async (ops: Op[]): Promise<void> => {
  await rawApiClient.post<null>(`${API}/ops`, { ops: ops.map(toWireOp) })
}

export const duplicateItem = async (id: string): Promise<Item> =>
  fromWireItem(
    await rawApiClient.post<WireItem>(
      `${API}/items/${encodeURIComponent(id)}/duplicate`,
    ),
  )

export const fetchTrash = async (): Promise<TrashedPage[]> =>
  fromWireTrash(await rawApiClient.get<WireTrash>(`${API}/trash`))

// restoreFromTrash puts a page back at the end of the top level. To put it
// somewhere else, send a restore op.
export const restoreFromTrash = async (id: string): Promise<void> => {
  await rawApiClient.post<null>(
    `${API}/trash/${encodeURIComponent(id)}/restore`,
  )
}

export const deleteFromTrash = async (id: string): Promise<void> => {
  await rawApiClient.delete<null>(`${API}/trash/${encodeURIComponent(id)}`)
}

export const emptyTrash = async (): Promise<number> =>
  (await rawApiClient.delete<{ deleted: number }>(`${API}/trash`)).deleted

// opIndex returns the index of the operation a batch was rejected for, if any.
export function opIndex(err: unknown): number | undefined {
  if (!(err instanceof ApiError)) return undefined
  const i = err.data?.op_index
  return typeof i === 'number' ? i : undefined
}
