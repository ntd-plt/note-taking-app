// The sun/moon button in the landing Header: a menu to pick Light, Dark or
// System, the same choice as in the settings popup.
import { Moon, Sun } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { THEME_OPTIONS, useTheme } from '#/shared/lib/theme'
import type { ThemePreference } from '#/shared/lib/theme'

export function ThemeMenu() {
  const preference = useTheme((s) => s.preference)
  const resolved = useTheme((s) => s.resolved)
  const setPreference = useTheme((s) => s.setPreference)
  const TriggerIcon = resolved === 'dark' ? Moon : Sun

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Theme">
          <TriggerIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(v) => setPreference(v as ThemePreference)}
        >
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon className="size-3.5 opacity-60" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
