import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Header } from '@/shared'
import { validateSession, logout } from '#/shared/api'

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

export const Route = createFileRoute('/')({
  loader: async () => {
    return await validateSession()
  },
  component: App,
})

function App() {
  const router = useRouter()
  const navigate = useNavigate()
  const auth = Route.useLoaderData()

  const handleLogout = async () => {
    console.log('Logging out...')
    await logout()
    router.invalidate()
    navigate({ to: '/' })
  }

  const userData =
    auth.isAuthenticated && auth.user
      ? {
          name: auth.user.username,
          email: auth.user.email,
        }
      : null

  return (
    <div className="min-h-screen">
      <Header user={userData} onLogout={handleLogout} />
      <div className="container mx-auto p-6">
        <div className="mx-auto max-w-4xl">
          <h1 className="mb-4 text-3xl font-bold">Welcome to NoteApp</h1>
          <p className="mb-6 text-lg text-muted-foreground">
            A simple and elegant note-taking application built with modern web
            technologies.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-lg border p-6">
              <h2 className="mb-3 text-xl font-semibold">Get Started</h2>
              <p className="mb-4 text-muted-foreground">
                Create your first note and start organizing your thoughts.
              </p>
              <Button asChild>
                <a href="/notes">Create Note</a>
              </Button>
            </div>

            <div className="rounded-lg border p-6">
              <h2 className="mb-3 text-xl font-semibold">Your Notes</h2>
              <p className="mb-4 text-muted-foreground">
                View and manage all your notes in one place.
              </p>
              <Button variant="outline" asChild>
                <a href="/notes">View All Notes</a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
