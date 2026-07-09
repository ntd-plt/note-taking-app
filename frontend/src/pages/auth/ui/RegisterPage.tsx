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

import useRegister from '../api/useRegister'
import { AArrowDownIcon, PencilIcon } from 'lucide-react'

export function RegisterPage() {
  const navigate = useNavigate()
  const { mutate, isPending, error } = useRegister()

  async function handleRegister(formData: FormData) {
    const username = formData.get('username') as string
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    if (username && email && password) {
      mutate(
        {
          username,
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
    <form action={handleRegister} className="w-full">
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Create a new account</CardTitle>
              <div>
                <PencilIcon size={24} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 text-sm text-destructive">
                {error.message}
              </div>
            )}
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  name="username"
                  placeholder="johndoe"
                  required
                />
              </div>
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
              {!isPending ? <>Sign Up</> : <>Submitting...</>}
            </Button>
            <div className="flex w-full flex-row items-center justify-between mt-2">
              <span className="text-sm text-muted-foreground">
                Already have an account?
              </span>
              <Button variant="link" asChild>
                <Link to="/login">Login</Link>
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </form>
  )
}
