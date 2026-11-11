import { useParams } from '@tanstack/react-router'
import { PageView } from '#/widgets/block-editor'
import { AppShell } from '#/widgets/page-sidebar'

export function ItemsPage() {
  const { itemId } = useParams({ strict: false })
  return (
    <AppShell currentId={itemId}>
      {itemId ? (
        <PageView itemId={itemId} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Pick a page in the sidebar, or add one with +.
        </div>
      )}
    </AppShell>
  )
}
