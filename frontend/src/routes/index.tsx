import { createFileRoute } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Header } from '@/shared'
import { logout } from '#/shared/api'
import { endSession, sessionQuery, useSession } from '#/shared/hooks/useSession'

export const Route = createFileRoute('/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(sessionQuery),
  component: App,
})

function App() {
  const queryClient = useQueryClient()
  const { data: user } = useSession()

  const handleLogout = async () => {
    await logout()
    endSession(queryClient)
  }

  const userData = user ? { name: user.username, email: user.email } : null

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
                <a href="/items">Create Note</a>
              </Button>
            </div>

            <div className="rounded-lg border p-6">
              <h2 className="mb-3 text-xl font-semibold">Your Notes</h2>
              <p className="mb-4 text-muted-foreground">
                View and manage all your notes in one place.
              </p>
              <Button variant="outline" asChild>
                <a href="/items">View All Notes</a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
