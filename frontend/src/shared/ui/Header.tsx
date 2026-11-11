import { Link } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@/components/ui/navigation-menu'
import { cn } from '@/lib/utils'
import { openSettings } from '#/shared/lib/settingsDialog'
import { ThemeMenu } from './ThemeMenu'
import { LogOut, Settings } from 'lucide-react'

interface HeaderProps {
  className?: string
  user?: {
    name: string
    email: string
    avatar?: string
  } | null
  onLogout?: () => void
}

type NavLinkTo = '/' | '/items'

type NavItem = { label: string; signedInOnly?: boolean } & (
  | {
      to: NavLinkTo
      // On wide screens the item opens this menu instead of linking.
      menu?: Array<{ label: string; description: string; to: NavLinkTo }>
    }
  | { onClick: () => void }
)

// The main navigation, shown in the top bar on wide screens and along the
// bottom on narrow ones.
const NAV_ITEMS: NavItem[] = [
  { label: 'Home', to: '/' },
  {
    label: 'Notes',
    to: '/items',
    menu: [
      {
        label: 'All Notes',
        description: 'View and manage all your notes',
        to: '/items',
      },
      { label: 'Create Note', description: 'Create a new note', to: '/items' },
    ],
  },
  { label: 'Settings', onClick: () => openSettings(), signedInOnly: true },
]

export function Header({ className, user = null, onLogout }: HeaderProps) {
  const navItems = NAV_ITEMS.filter((item) => user || !item.signedInOnly)
  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60',
        className,
      )}
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <span className="text-primary-foreground font-bold text-sm">
                N
              </span>
            </div>
            <span className="text-lg font-semibold tracking-tight hidden sm:inline">
              NoteApp
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <NavigationMenu className="hidden md:flex">
          <NavigationMenuList>
            {navItems.map((item) => (
              <NavigationMenuItem key={item.label}>
                {'to' in item && item.menu ? (
                  <>
                    <NavigationMenuTrigger className="text-sm font-medium">
                      {item.label}
                    </NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <ul className="grid w-64 p-2">
                        {item.menu.map((entry) => (
                          <li key={entry.label}>
                            <NavigationMenuLink asChild>
                              <Link
                                to={entry.to}
                                className="block select-none rounded-md p-3 hover:bg-muted"
                              >
                                <div className="text-sm font-medium">
                                  {entry.label}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {entry.description}
                                </p>
                              </Link>
                            </NavigationMenuLink>
                          </li>
                        ))}
                      </ul>
                    </NavigationMenuContent>
                  </>
                ) : (
                  <NavigationMenuLink asChild>
                    {'to' in item ? (
                      <Link
                        to={item.to}
                        className="flex items-center gap-1.5 rounded-2xl p-3 text-sm font-medium transition-all"
                      >
                        {item.label}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={item.onClick}
                        className="flex cursor-pointer items-center gap-1.5 rounded-2xl p-3 text-sm font-medium transition-all"
                      >
                        {item.label}
                      </button>
                    )}
                  </NavigationMenuLink>
                )}
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>

        {/* User Actions */}
        <div className="flex items-center gap-2">
          <ThemeMenu />
          {user ? (
            <div className="flex items-center gap-3">
              {/* User Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative h-8 w-8 rounded-full"
                  >
                    <Avatar className="h-8 w-8">
                      {user.avatar && (
                        <AvatarImage src={user.avatar} alt={user.name} />
                      )}
                      <AvatarFallback>
                        {user.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => openSettings()}>
                    <Settings className="mr-2 h-3.5 w-3.5 opacity-60" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onLogout}>
                    <LogOut className="mr-2 h-3.5 w-3.5 opacity-60" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" asChild>
                <Link to="/login">Login</Link>
              </Button>
              <Button size="sm" asChild>
                <Link to="/signup">Sign Up</Link>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Navigation */}
      <div className="md:hidden border-t border-border">
        <div className="container mx-auto px-4 py-2">
          <nav className="flex items-center justify-around">
            {navItems.map((item) => {
              const badge = (
                <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center mb-1">
                  <span className="text-primary font-bold text-xs">
                    {item.label.charAt(0)}
                  </span>
                </div>
              )
              return 'to' in item ? (
                <Link
                  key={item.label}
                  to={item.to}
                  className="flex flex-col items-center p-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                  activeProps={{
                    className: 'text-foreground',
                  }}
                >
                  {badge}
                  {item.label}
                </Link>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.onClick}
                  className="flex cursor-pointer flex-col items-center p-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  {badge}
                  {item.label}
                </button>
              )
            })}
          </nav>
        </div>
      </div>
    </header>
  )
}
