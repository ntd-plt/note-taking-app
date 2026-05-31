import Editor from '@/widgets/note-editor/ui/Editor'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from './Sidebar'

export function AllNotesPage() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-background flex flex-col h-screen overflow-hidden">
        <Editor />
      </SidebarInset>
    </SidebarProvider>
  )
}
