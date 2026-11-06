// The settings popup: a large dialog over the blurred page, with the sections
// listed on the left and the chosen one on the right. Only Appearance exists
// for now. Changes apply at once; there is no Save.
import type * as React from 'react'
import { Monitor, Moon, Palette, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '#/components/ui/dialog'
import { Separator } from '#/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { cn } from '#/lib/utils'
import { useSettingsDialog } from '#/shared/lib/settingsDialog'
import type { SettingsSection } from '#/shared/lib/settingsDialog'
import { useTheme } from '#/shared/lib/theme'
import type { ThemePreference } from '#/shared/lib/theme'

// Each section with its panel. A new section is one more entry here.
const SECTIONS: Array<{
  id: SettingsSection
  label: string
  icon: LucideIcon
  Panel: () => React.JSX.Element
}> = [
  {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    Panel: AppearanceSection,
  },
]

const SECTIONS_BY_ID = new Map(SECTIONS.map((s) => [s.id, s]))

export function SettingsDialog() {
  const open = useSettingsDialog((s) => s.open)
  const section = useSettingsDialog((s) => s.section)
  const setOpen = useSettingsDialog((s) => s.setOpen)
  const setSection = useSettingsDialog((s) => s.setSection)
  const current = SECTIONS_BY_ID.get(section) ?? SECTIONS[0]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex h-[560px] max-h-[calc(100dvh-4rem)] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <nav
          aria-label="Settings sections"
          className="flex w-56 shrink-0 flex-col gap-1 border-r border-border bg-sidebar p-4"
        >
          <DialogTitle className="px-3 pt-2 pb-4 font-heading text-xl">
            Settings
          </DialogTitle>
          {SECTIONS.map((entry) => {
            const { id, label, icon: Icon } = entry
            const active = entry === current
            return (
              <button
                key={id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => setSection(id)}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  active && 'bg-sidebar-accent text-sidebar-accent-foreground',
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            )
          })}
        </nav>
        <div className="flex-1 overflow-y-auto px-10 py-12">
          <current.Panel />
        </div>
      </DialogContent>
    </Dialog>
  )
}

const THEME_OPTIONS: Array<{
  value: ThemePreference
  label: string
  icon: LucideIcon
}> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

function AppearanceSection() {
  const preference = useTheme((s) => s.preference)
  const setPreference = useTheme((s) => s.setPreference)

  return (
    <section aria-labelledby="settings-appearance-title">
      <h2
        id="settings-appearance-title"
        className="text-lg font-semibold text-foreground"
      >
        Appearance
      </h2>
      <DialogDescription className="mt-1">
        Customize how NoteApp looks. Saved on this device.
      </DialogDescription>
      <Separator className="my-6" />
      <div className="flex items-center justify-between gap-6">
        <div>
          <p id="settings-theme-label" className="text-sm font-medium">
            Theme
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pick light or dark, or follow your system setting.
          </p>
        </div>
        <ToggleGroup
          type="single"
          value={preference}
          // Clicking the current option would clear it; a theme is always set.
          onValueChange={(v) => v && setPreference(v as ThemePreference)}
          aria-labelledby="settings-theme-label"
          spacing={1}
          className="shrink-0 rounded-4xl bg-muted p-1"
        >
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <ToggleGroupItem
              key={value}
              value={value}
              size="sm"
              className="cursor-pointer gap-1.5 text-muted-foreground hover:bg-transparent data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
            >
              <Icon />
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </section>
  )
}
