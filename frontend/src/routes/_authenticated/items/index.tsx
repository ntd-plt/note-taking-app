import { createFileRoute } from '@tanstack/react-router'
import { ItemsPage } from '@/pages/items'

export const Route = createFileRoute('/_authenticated/items/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <ItemsPage />
}
