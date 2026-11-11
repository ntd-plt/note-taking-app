import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  invalidateTree,
  itemKeys,
  pageName,
  useApplyOps,
  useDuplicateItem,
  usePages,
} from '#/entities/item'
import type { EditorRefresh } from '#/entities/item'
import { mockTree, resetMockTree } from './item.handlers'

afterEach(() => {
  cleanup()
  resetMockTree()
})

function setup() {
  resetMockTree({ empty: true })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(
    () => ({
      pages: usePages(),
      applyOps: useApplyOps(),
      duplicate: useDuplicateItem(),
    }),
    { wrapper },
  )
}

describe('item query hooks', () => {
  it('refetches the sidebar after a batch that adds a page', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.pages.data).toEqual([]))

    const page = crypto.randomUUID()
    await act(() =>
      result.current.applyOps.mutateAsync({
        ops: [
          {
            op: 'create',
            id: page,
            type: 'page',
            parentId: mockTree().workspaceId,
            props: { name: 'Fresh' },
          },
        ],
      }),
    )
    await waitFor(() =>
      expect(result.current.pages.data?.map(pageName)).toEqual(['Fresh']),
    )

    await act(() => result.current.duplicate.mutateAsync(page))
    await waitFor(() =>
      expect(result.current.pages.data?.map(pageName)).toEqual([
        'Fresh',
        'Fresh (Copy 1)',
      ]),
    )
  })

  it('refetches the sidebar after any batch, such as a rename', async () => {
    const { result } = setup()
    const page = crypto.randomUUID()
    await act(() =>
      result.current.applyOps.mutateAsync({
        ops: [
          {
            op: 'create',
            id: page,
            type: 'page',
            parentId: mockTree().workspaceId,
          },
        ],
      }),
    )
    await waitFor(() => expect(result.current.pages.data).toHaveLength(1))

    await act(() =>
      result.current.applyOps.mutateAsync({
        ops: [{ op: 'update', id: page, props: { name: 'Renamed' } }],
        editor: 'keep',
      }),
    )
    await waitFor(() =>
      expect(result.current.pages.data?.map(pageName)).toEqual(['Renamed']),
    )
  })
})

describe('invalidateTree', () => {
  // Which cached queries end up invalidated, by key.
  async function invalidated(editor?: EditorRefresh) {
    const client = new QueryClient()
    for (const key of [itemKeys.item('x'), itemKeys.pages, itemKeys.trash])
      client.setQueryData(key, [])
    await invalidateTree(client, editor && { editor })
    return client
      .getQueryCache()
      .getAll()
      .filter((q) => q.state.isInvalidated)
      .map((q) => q.queryKey[0])
  }

  it('always invalidates the pages and the trash', async () => {
    expect(await invalidated('keep')).toEqual(['pages', 'trash'])
  })

  it('invalidates open items unless told to keep them', async () => {
    expect(await invalidated()).toEqual(['item', 'pages', 'trash'])
    expect(await invalidated('stale')).toEqual(['item', 'pages', 'trash'])
  })
})
