import * as React from 'react'

// import { SearchForm } from '@/components/search-form'
// import { VersionSwitcher } from '@/components/version-switcher'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import type { IconNode } from 'lucide-react'

export interface NoteSidebarData {
  spaces: {
    name: string
    notes: {
      url: string
      title: string
      icon?: IconNode
      isActive: boolean
    }[]
  }[]
}

export interface NodeSidebarProps {
  data: NoteSidebarData
}

export function AppSidebar({ data }: NodeSidebarProps) {
  return (
    <Sidebar>
      <SidebarHeader></SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          {/* We create a SidebarGroup for each parent. */}
          <SidebarMenu>
            {data.spaces.map((space) => (
              <SidebarMenuItem key={space.name}>
                <SidebarMenuButton asChild>
                  <a href={space.name} className="font-medium">
                    {space.name}
                  </a>
                </SidebarMenuButton>
                <SidebarMenuSub>
                  {space.notes.map((item) => (
                    <SidebarMenuSubItem key={item.title}>
                      <SidebarMenuSubButton asChild isActive={item.isActive}>
                        <a className="font-small" href={item.url}>
                          {item.title}
                        </a>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
