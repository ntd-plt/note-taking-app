import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Button } from '#/components/ui/button'
import { getAuthErrorMessage } from '#/shared/lib/auth_errors'
import useLogin from '../api/useLogin'
import { AuthCard } from './AuthCard'
import { FormField } from './FormField'

export function LoginPage() {
  const navigate = useNavigate()
  const { mutate, isPending, error } = useLogin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function handleLogin() {
    if (email && password) {
      mutate(
        { email, password },
        { onSuccess: () => void navigate({ to: '/items' }) },
      )
    }
  }

  return (
    <AuthCard
      title="Login to your account"
      onSubmit={handleLogin}
      error={error && getAuthErrorMessage(error)}
      submitLabel="Login"
      pending={isPending}
      footer={
        <>
          <a
            href="#"
            className="inline-block text-sm underline-offset-4 hover:underline"
          >
            Forgot your password?
          </a>
          <Button variant="link" asChild>
            <Link to="/signup">Sign Up</Link>
          </Button>
        </>
      }
    >
      <FormField
        id="email"
        label="Email"
        type="email"
        placeholder="m@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <FormField
        id="password"
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
    </AuthCard>
  )
}
