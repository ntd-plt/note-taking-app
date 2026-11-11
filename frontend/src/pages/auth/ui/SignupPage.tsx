import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { PencilIcon } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { getAuthErrorMessage } from '#/shared/lib/auth_errors'
import useSignup from '../api/useSignup'
import { AuthCard } from './AuthCard'
import { FormField } from './FormField'

export function SignupPage() {
  const navigate = useNavigate()
  const { mutate, isPending, error } = useSignup()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function handleSignup() {
    if (username && email && password) {
      mutate(
        { username, email, password },
        { onSuccess: () => void navigate({ to: '/items' }) },
      )
    }
  }

  return (
    <AuthCard
      title="Create a new account"
      icon={<PencilIcon size={24} />}
      onSubmit={handleSignup}
      error={error && getAuthErrorMessage(error, { serverMessageFor400: true })}
      submitLabel="Sign Up"
      pending={isPending}
      footer={
        <>
          <span className="text-sm text-muted-foreground">
            Already have an account?
          </span>
          <Button variant="link" asChild>
            <Link to="/login">Login</Link>
          </Button>
        </>
      }
    >
      <FormField
        id="username"
        label="Username"
        maxLength={50}
        type="text"
        placeholder="johndoe"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
      />
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
        minLength={6}
        maxLength={72}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
    </AuthCard>
  )
}
