import { SidebarInset, SidebarProvider } from '#/components/ui/sidebar'
import { PageSidebar } from '#/widgets/page-sidebar'

// The trash is rebuilt for pages later; until then it is a placeholder.
export function TrashPage() {
  return (
    <SidebarProvider>
      <PageSidebar />
      <SidebarInset className="flex h-screen flex-col overflow-hidden bg-background">
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
          <span className="text-2xl">🗑️</span>
          <span>The trash is coming back soon.</span>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
