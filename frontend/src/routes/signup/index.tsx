import { createFileRoute } from '@tanstack/react-router'
import { SignupPage } from '@/pages/auth'

export const Route = createFileRoute('/signup/')({
  component: SignupComponent,
})

function SignupComponent() {
  return SignupPage()
}
