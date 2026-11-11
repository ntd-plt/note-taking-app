// The sidebar's top row: the account menu (settings, log out) and the button
// that closes the sidebar.
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  ChevronsUpDown,
  LogOut,
  MonitorX,
  PanelLeftClose,
  Settings,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { useSidebar } from '#/components/ui/sidebar'
import { logout, logoutAll } from '#/shared/api'
import { endSession, useSession } from '#/shared/hooks/useSession'
import { errorMessage } from '#/shared/lib/errors'
import { openSettings } from '#/shared/lib/settingsDialog'

export function AccountMenu() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toggleSidebar } = useSidebar()
  const { data: user } = useSession()
  const name = user ? user.username || user.email.split('@')[0] : 'User'

  // Ends this browser's session, or every session of the user, then leaves.
  const signOut = async (everywhere: boolean) => {
    try {
      await (everywhere ? logoutAll() : logout())
    } catch (err) {
      toast.error(`Couldn't log out: ${errorMessage(err)}`)
      return
    }
    endSession(queryClient)
    void navigate({ to: '/login' })
  }
  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex min-w-0 flex-1 items-center justify-between rounded-lg px-2 py-1.5 text-left transition-all hover:bg-sidebar-accent/50 focus:outline-none">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 font-semibold text-link shadow-sm ring-1 ring-primary/20">
                {name.substring(0, 2).toUpperCase()}
              </div>
              <span className="text-[10px] font-semibold tracking-wide text-sidebar-foreground">
                {name}
              </span>
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="start" sideOffset={6}>
          <DropdownMenuItem
            className="cursor-pointer px-2 py-1.5 text-xs"
            onClick={() => openSettings()}
          >
            <Settings className="mr-2 h-3.5 w-3.5 opacity-60" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="cursor-pointer px-2 py-1.5 text-xs text-destructive"
            onClick={() => void signOut(false)}
          >
            <LogOut className="mr-2 h-3.5 w-3.5 opacity-60" />
            Log Out
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer px-2 py-1.5 text-xs text-destructive"
            onClick={() => void signOut(true)}
          >
            <MonitorX className="mr-2 h-3.5 w-3.5 opacity-60" />
            Log out of all devices
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        onClick={toggleSidebar}
        title="Close sidebar"
        aria-label="Close sidebar"
        className="shrink-0 cursor-pointer rounded-md p-1.5 text-muted-foreground/70 transition-all hover:bg-sidebar-accent/60 hover:text-foreground"
      >
        <PanelLeftClose className="h-4 w-4" />
      </button>
    </div>
  )
}
