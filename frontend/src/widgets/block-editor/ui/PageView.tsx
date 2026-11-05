// An open item: the page header and its editor. For a block URL it shows the
// containing page, scrolls to the block, then switches the address to the page.
import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { applyOps, itemKeys, useItem } from '#/entities/item'
import type { Item, Op } from '#/entities/item'
import { BlockEditor } from './BlockEditor'
import { PageHeader } from './PageHeader'

export interface PageViewProps {
  itemId: string
  // Replaces the default notice shown on a page in the trash.
  trashBanner?: (page: Item) => React.ReactNode
}

export function PageView({ itemId, trashBanner }: PageViewProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const query = useItem(itemId)
  const [saving, setSaving] = React.useState(false)
  const reloading = React.useRef(false)

  const send = React.useCallback(
    async (ops: Op[], refreshPages: boolean) => {
      await applyOps(ops)
      // The cached page is now behind the editor. Mark it stale without
      // refetching, so it loads fresh next time it is opened.
      void queryClient.invalidateQueries({
        queryKey: itemKeys.items,
        refetchType: 'none',
      })
      if (refreshPages)
        await queryClient.invalidateQueries({ queryKey: itemKeys.pages })
    },
    [queryClient],
  )

  const onSaveFailed = React.useCallback(
    (err: unknown) => {
      if (reloading.current) return
      reloading.current = true
      const reason = err instanceof Error ? `: ${err.message}` : ''
      toast.error(`Couldn't save your changes${reason}. The page was reloaded.`)
      void queryClient
        .invalidateQueries({ queryKey: itemKeys.item(itemId) })
        .then(() => queryClient.invalidateQueries({ queryKey: itemKeys.pages }))
        .finally(() => {
          reloading.current = false
        })
    },
    [queryClient, itemId],
  )

  const data = query.data
  const page = data?.items.at(0)

  const onFocused = React.useCallback(() => {
    if (!page || page.id === itemId) return
    // Hand the loaded page to the page URL's query, keeping its update time so
    // the editor is not remounted, then switch the address.
    queryClient.setQueryData(itemKeys.item(page.id), data, {
      updatedAt: query.dataUpdatedAt,
    })
    void navigate({
      to: '/items/$itemId',
      params: { itemId: page.id },
      replace: true,
    })
  }, [page, itemId, data, query.dataUpdatedAt, queryClient, navigate])

  if (query.isPending) {
    return (
      <div className="p-10 text-sm text-muted-foreground" role="status">
        Loading…
      </div>
    )
  }
  if (query.isError || !data || !page) {
    return (
      <div className="p-10 text-sm text-muted-foreground" role="alert">
        This page could not be opened. It may have been deleted.
      </div>
    )
  }

  const editable = !data.inTrash
  const key = `${page.id}:${query.dataUpdatedAt}`
  const savePage = async (props: { name?: string; icon?: string }) => {
    try {
      await send([{ op: 'update', id: page.id, props }], true)
    } catch (err) {
      onSaveFailed(err)
    }
  }

  return (
    <div
      className="flex h-full flex-col overflow-y-auto"
      data-page-view={page.id}
    >
      {data.inTrash &&
        (trashBanner?.(page) ?? (
          <div className="bg-destructive/10 px-6 py-2 text-xs text-destructive">
            This page is in the trash.
          </div>
        ))}
      <PageHeader
        key={key}
        page={page}
        ancestors={data.ancestors}
        saving={saving}
        readOnly={!editable}
        onSave={savePage}
      />
      <div className="mx-auto w-full max-w-4xl pb-40">
        <BlockEditor
          key={key}
          opened={data}
          editable={editable}
          send={send}
          onSaveFailed={onSaveFailed}
          onSavingChange={setSaving}
          focusId={data.focusId}
          onFocused={onFocused}
        />
      </div>
    </div>
  )
}
