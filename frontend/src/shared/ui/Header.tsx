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

interface HeaderProps {
  className?: string
  user?: {
    name: string
    email: string
    avatar?: string
  } | null
  onLogout?: () => void
}

export function Header({ className, user = null, onLogout }: HeaderProps) {
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
            <NavigationMenuItem>
              <NavigationMenuLink asChild>
                <Link to="/" className="flex items-center gap-1.5 rounded-none p-3 text-sm font-medium transition-all">
                  Home
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuTrigger className="text-sm font-medium">
                Notes
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-64 p-2">
                  <li>
                    <NavigationMenuLink asChild>
                      <Link to="/notes" className="block select-none rounded-md p-3 hover:bg-muted">
                        <div className="text-sm font-medium">All Notes</div>
                        <p className="text-sm text-muted-foreground">
                          View and manage all your notes
                        </p>
                      </Link>
                    </NavigationMenuLink>
                  </li>
                  <li>
                    <NavigationMenuLink asChild>
                      <Link to="/notes" className="block select-none rounded-md p-3 hover:bg-muted">
                        <div className="text-sm font-medium">Create Note</div>
                        <p className="text-sm text-muted-foreground">
                          Create a new note
                        </p>
                      </Link>
                    </NavigationMenuLink>
                  </li>
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink asChild>
                <Link to="/profile" className="flex items-center gap-1.5 rounded-none p-3 text-sm font-medium transition-all">
                  Profile
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink asChild>
                <Link to="/settings" className="flex items-center gap-1.5 rounded-none p-3 text-sm font-medium transition-all">
                  Settings
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        {/* User Actions */}
        <div className="flex items-center gap-2">
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
                  <Link to="/profile">
                    <DropdownMenuItem>Profile</DropdownMenuItem>
                  </Link>
                  <Link to="/settings">
                    <DropdownMenuItem>Settings</DropdownMenuItem>
                  </Link>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onLogout}>
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
            <Link
              to="/"
              className="flex flex-col items-center p-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              activeProps={{
                className: 'text-foreground',
              }}
            >
              <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center mb-1">
                <span className="text-primary font-bold text-xs">H</span>
              </div>
              Home
            </Link>
            <Link
              to="/notes"
              className="flex flex-col items-center p-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              activeProps={{
                className: 'text-foreground',
              }}
            >
              <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center mb-1">
                <span className="text-primary font-bold text-xs">N</span>
              </div>
              Notes
            </Link>
            <Link
              to="/profile"
              className="flex flex-col items-center p-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              activeProps={{
                className: 'text-foreground',
              }}
            >
              <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center mb-1">
                <span className="text-primary font-bold text-xs">P</span>
              </div>
              Profile
            </Link>
            <Link
              to="/settings"
              className="flex flex-col items-center p-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              activeProps={{
                className: 'text-foreground',
              }}
            >
              <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center mb-1">
                <span className="text-primary font-bold text-xs">S</span>
              </div>
              Settings
            </Link>
          </nav>
        </div>
      </div>
    </header>
  )
}
