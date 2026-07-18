import { Link, useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import useLogin from '../api/useLogin'

export function LoginPage() {
  const navigate = useNavigate()
  const { mutate, isPending, error } = useLogin()
  async function handleLogin(formData: FormData) {
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    console.log(email)
    console.log(password)
    if (email && password) {
      mutate(
        {
          email,
          password,
        },
        {
          onSuccess: () => {
            navigate({ to: '/notes' })
          },
        },
      )
    }
  }

  return (
    <form action={handleLogin} className="w-full">
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Login to your account</CardTitle>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="text-sm text-destructive">{error.message}</div>
            )}
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  name="email"
                  placeholder="m@example.com"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input name="password" id="password" type="password" required />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-2">
            <Button type="submit" className="w-full">
              {!isPending ? <>Login</> : <>Submiting...</>}
            </Button>
            <div className="flex w-full flex-row items-center justify-between">
              <a
                href="#"
                className="inline-block text-sm underline-offset-4 hover:underline"
              >
                Forgot your password?
              </a>
              <Button variant="link">
                <Link to="/signup">Sign Up</Link>
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </form>
  )
}
