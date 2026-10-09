import { useParams } from '@tanstack/react-router'
import { Editor, useItemsQuery, useItemsStore } from '@/widgets/note-editor'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from './Sidebar'
import { FolderView } from './FolderView'

function ItemContent() {
  const params = useParams({ strict: false })
  const activeItemId = useItemsStore((state) => state.activeItemId)
  const { data: itemsData } = useItemsQuery()

  const openId = params.itemId || activeItemId
  const openItem = (itemsData ?? []).find((i) => i.id === openId)

  if (openItem?.type === 'folder') {
    return <FolderView folder={openItem} />
  }
  return <Editor />
}

export function ItemsPage() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-background flex flex-col h-screen overflow-hidden">
        <ItemContent />
      </SidebarInset>
    </SidebarProvider>
  )
}
