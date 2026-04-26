import { Link } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
              <span className="text-sm font-bold text-primary-foreground">
                N
              </span>
            </div>
            <span className="hidden text-lg font-semibold tracking-tight sm:inline">
              NoteApp
            </span>
          </Link>
        </div>

        {/* Navigation */}
        {/* <NavigationMenu className="hidden md:flex"> */}
        {/*   <NavigationMenuList> */}
        {/*     <NavigationMenuItem> */}
        {/*       <NavigationMenuLink href="/" className="text-sm font-medium"> */}
        {/*         Home */}
        {/*       </NavigationMenuLink> */}
        {/*     </NavigationMenuItem> */}
        {/*     <NavigationMenuItem> */}
        {/*       <NavigationMenuTrigger className="text-sm font-medium"> */}
        {/*         Notes */}
        {/*       </NavigationMenuTrigger> */}
        {/*       <NavigationMenuContent> */}
        {/*         <ul className="grid w-64 p-2"> */}
        {/*           <li> */}
        {/*             <NavigationMenuLink */}
        {/*               href="/notes" */}
        {/*               className="block rounded-md p-3 select-none hover:bg-muted" */}
        {/*             > */}
        {/*               <div className="text-sm font-medium">All Notes</div> */}
        {/*               <p className="text-sm text-muted-foreground"> */}
        {/*                 View and manage all your notes */}
        {/*               </p> */}
        {/*             </NavigationMenuLink> */}
        {/*           </li> */}
        {/*           <li> */}
        {/*             <NavigationMenuLink */}
        {/*               href="/notes" */}
        {/*               className="block rounded-md p-3 select-none hover:bg-muted" */}
        {/*             > */}
        {/*               <div className="text-sm font-medium">Create Note</div> */}
        {/*               <p className="text-sm text-muted-foreground"> */}
        {/*                 Create a new note */}
        {/*               </p> */}
        {/*             </NavigationMenuLink> */}
        {/*           </li> */}
        {/*         </ul> */}
        {/*       </NavigationMenuContent> */}
        {/*     </NavigationMenuItem> */}
        {/*     <NavigationMenuItem> */}
        {/*       <NavigationMenuLink */}
        {/*         href="/profile" */}
        {/*         className="text-sm font-medium" */}
        {/*       > */}
        {/*         Profile */}
        {/*       </NavigationMenuLink> */}
        {/*     </NavigationMenuItem> */}
        {/*     <NavigationMenuItem> */}
        {/*       <NavigationMenuLink */}
        {/*         href="/settings" */}
        {/*         className="text-sm font-medium" */}
        {/*       > */}
        {/*         Settings */}
        {/*       </NavigationMenuLink> */}
        {/*     </NavigationMenuItem> */}
        {/*   </NavigationMenuList> */}
        {/* </NavigationMenu> */}
        {/**/}
        {/* User Actions */}
        <div className="flex items-center gap-2">
          {user ? (
            <div className="flex items-center gap-3">
              {/* <Dropdown /> */}
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
    </header>
  )
}
