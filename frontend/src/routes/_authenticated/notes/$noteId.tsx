import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/notes/$noteId')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/notes/$noteId"!</div>
}
