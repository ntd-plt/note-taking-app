// The centered card shared by the login and signup forms.
import type * as React from 'react'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'

export function AuthCard({
  title,
  icon,
  onSubmit,
  error,
  submitLabel,
  pending,
  children,
  footer,
}: {
  title: string
  icon?: React.ReactNode
  onSubmit: () => void
  error?: string | null
  submitLabel: string
  pending: boolean
  children: React.ReactNode
  footer: React.ReactNode
}) {
  return (
    <form action={onSubmit} className="w-full">
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{title}</CardTitle>
              {icon}
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 text-sm text-destructive">{error}</div>
            )}
            <div className="flex flex-col gap-6">{children}</div>
          </CardContent>
          <CardFooter className="flex-col gap-2">
            <Button type="submit" className="w-full">
              {pending ? 'Submitting...' : submitLabel}
            </Button>
            <div className="mt-2 flex w-full flex-row items-center justify-between">
              {footer}
            </div>
          </CardFooter>
        </Card>
      </div>
    </form>
  )
}
