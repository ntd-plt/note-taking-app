import { createFileRoute } from '@tanstack/react-router'
import { AllNotesPage } from '@/pages/notes/ui/AllNotesPage'

export const Route = createFileRoute('/_authenticated/notes/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <AllNotesPage />
}
