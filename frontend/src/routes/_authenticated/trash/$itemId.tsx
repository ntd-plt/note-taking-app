import { createFileRoute } from '@tanstack/react-router'
import { TrashPage } from '@/pages/trash'

export const Route = createFileRoute('/_authenticated/trash/$itemId')({
  component: RouteComponent,
})

function RouteComponent() {
  return <TrashPage />
}
