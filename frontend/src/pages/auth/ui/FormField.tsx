import type * as React from 'react'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'

// A labelled input; the id doubles as the field's name.
export function FormField({
  id,
  label,
  ...props
}: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} {...props} />
    </div>
  )
}
