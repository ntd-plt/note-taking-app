import { useParams } from '@tanstack/react-router'
import { SidebarInset, SidebarProvider } from '#/components/ui/sidebar'
import { PageView } from '#/widgets/block-editor'
import { PageSidebar } from '#/widgets/page-sidebar'

export function ItemsPage() {
  const { itemId } = useParams({ strict: false })
  return (
    <SidebarProvider>
      <PageSidebar currentId={itemId} />
      <SidebarInset className="flex h-screen flex-col overflow-hidden bg-background">
        {itemId ? (
          <PageView itemId={itemId} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Pick a page in the sidebar, or add one with +.
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  )
}
