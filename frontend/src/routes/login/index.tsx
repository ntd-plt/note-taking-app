import { createFileRoute } from '@tanstack/react-router'
import { LoginPage } from '@/pages/auth'

export const Route = createFileRoute('/login/')({
  component: LoginComponent,
})

function LoginComponent() {
  return LoginPage()
}
