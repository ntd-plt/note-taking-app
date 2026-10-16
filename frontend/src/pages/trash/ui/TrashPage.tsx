import { useParams } from '@tanstack/react-router'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/pages/items'
import { TrashView } from './TrashView'

export function TrashPage() {
  const params = useParams({ strict: false })
  return (
    <SidebarProvider>
      <AppSidebar inTrash />
      <SidebarInset className="bg-background flex flex-col h-screen overflow-hidden">
        <TrashView folderId={params.itemId ?? null} />
      </SidebarInset>
    </SidebarProvider>
  )
}
