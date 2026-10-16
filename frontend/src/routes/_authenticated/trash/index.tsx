import { createFileRoute } from '@tanstack/react-router'
import { TrashPage } from '@/pages/trash'

export const Route = createFileRoute('/_authenticated/trash/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <TrashPage />
}
