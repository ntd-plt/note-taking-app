// The signed-in layout: the page sidebar and the main area beside it.
import type * as React from 'react'
import { SidebarInset, SidebarProvider } from '#/components/ui/sidebar'
import { PageSidebar } from './PageSidebar'

export function AppShell({
  currentId,
  children,
}: {
  currentId?: string
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <PageSidebar currentId={currentId} />
      <SidebarInset className="flex h-screen flex-col overflow-hidden bg-background">
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
