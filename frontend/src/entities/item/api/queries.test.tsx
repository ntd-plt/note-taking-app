import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  pageName,
  useApplyOps,
  useDuplicateItem,
  usePages,
} from '#/entities/item'
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

  it('leaves the sidebar alone for a block-only batch unless told otherwise', async () => {
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

    // A rename is an update, which applyOps cannot tell apart from a block edit.
    const rename = {
      op: 'update' as const,
      id: page,
      props: { name: 'Renamed' },
    }
    await act(() => result.current.applyOps.mutateAsync({ ops: [rename] }))
    expect(result.current.pages.data?.map(pageName)).toEqual(['New Page'])

    await act(() =>
      result.current.applyOps.mutateAsync({
        ops: [{ ...rename, props: { name: 'Again' } }],
        refreshPages: true,
      }),
    )
    await waitFor(() =>
      expect(result.current.pages.data?.map(pageName)).toEqual(['Again']),
    )
  })
})
