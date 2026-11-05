// The top of an open page: breadcrumb and save status, then the icon and title.
// The title saves one second after the last keystroke; a blank title is kept on
// screen but not sent (the server needs a name).
import * as React from 'react'
import { Link } from '@tanstack/react-router'
import { Calendar } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { useSidebar } from '#/components/ui/sidebar'
import { cn } from '#/lib/utils'
import { MAX_NAME_LENGTH, pageIcon, pageName } from '#/entities/item'
import type { Item } from '#/entities/item'
import { SAVE_DELAY_MS } from '../model/pageSaver'

const EMOJI_LIST = [
  '📄',
  '🚀',
  '💡',
  '📝',
  '💼',
  '📅',
  '🎯',
  '🏠',
  '🛒',
  '🎬',
  '🔑',
  '🎨',
  '🍕',
  '⚡',
  '🍀',
]

const formatDate = (s: string) =>
  new Date(s).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const separator = (
  <span className="text-muted-foreground/40 font-normal select-none">
    {'>'}
  </span>
)

export function PageBreadcrumb({
  ancestors,
  current,
}: {
  ancestors: Item[]
  current: { name: string; icon: string }
}) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-medium text-muted-foreground/80"
    >
      <Link to="/items" className="hover:text-foreground transition-colors">
        Workspace
      </Link>
      {ancestors.map((a) => (
        <React.Fragment key={a.id}>
          {separator}
          <Link
            to="/items/$itemId"
            params={{ itemId: a.id }}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <span className="text-xs">{pageIcon(a)}</span>
            <span className="max-w-[160px] truncate">{pageName(a)}</span>
          </Link>
        </React.Fragment>
      ))}
      {separator}
      <span
        aria-current="page"
        className="flex items-center gap-1 font-semibold text-foreground/90"
      >
        <span className="text-xs">{current.icon}</span>
        <span className="max-w-[160px] truncate">{current.name}</span>
      </span>
    </nav>
  )
}

export interface PageHeaderProps {
  page: Item
  ancestors: Item[]
  saving: boolean
  readOnly: boolean
  onSave: (props: { name?: string; icon?: string }) => Promise<void>
}

export function PageHeader({
  page,
  ancestors,
  saving,
  readOnly,
  onSave,
}: PageHeaderProps) {
  const { state: sidebarState } = useSidebar()
  const [name, setName] = React.useState(() => pageName(page))
  const [icon, setIcon] = React.useState(() => pageIcon(page))
  const [savingTitle, setSavingTitle] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  const pendingName = React.useRef<string | null>(null)
  const onSaveRef = React.useRef(onSave)
  React.useEffect(() => {
    onSaveRef.current = onSave
  })

  const flushName = React.useCallback(() => {
    clearTimeout(timer.current)
    const next = pendingName.current
    pendingName.current = null
    if (next === null || next.trim() === '') return
    setSavingTitle(true)
    void onSaveRef.current({ name: next }).finally(() => setSavingTitle(false))
  }, [])
  React.useEffect(() => flushName, [flushName])

  const changeName = (value: string) => {
    setName(value)
    pendingName.current = value
    clearTimeout(timer.current)
    timer.current = setTimeout(flushName, SAVE_DELAY_MS)
  }

  const changeIcon = (value: string) => {
    setIcon(value)
    void onSaveRef.current({ icon: value })
  }

  const busy = saving || savingTitle

  return (
    <div className="w-full flex flex-col">
      <div
        className={cn(
          'flex items-start justify-between gap-4 pr-6 pt-1 pb-1',
          sidebarState === 'collapsed' ? 'pl-16' : 'pl-6',
        )}
      >
        <PageBreadcrumb
          ancestors={ancestors}
          current={{ name: name.trim() || pageName(page), icon }}
        />
        <div className="flex shrink-0 items-center gap-3 whitespace-nowrap text-[10px] font-medium text-muted-foreground/70">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Updated {formatDate(page.updatedAt)}
          </span>
          <span className="h-3 w-px bg-border/30" />
          {busy ? (
            <span className="flex items-center gap-1 font-semibold text-amber-500">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
              Saving...
            </span>
          ) : (
            <span className="flex items-center gap-1 font-semibold text-emerald-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Saved
            </span>
          )}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-4xl flex-col px-8 pt-4">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={readOnly}>
              <button
                aria-label="Change icon"
                className="cursor-pointer select-none rounded-lg p-1 text-4xl transition-all hover:bg-muted/80"
              >
                {icon}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="grid w-44 grid-cols-5 gap-1 p-2"
              align="start"
            >
              {EMOJI_LIST.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => changeIcon(emoji)}
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-sm transition-all hover:bg-sidebar-accent"
                >
                  {emoji}
                </button>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <input
          type="text"
          aria-label="Page title"
          value={name}
          readOnly={readOnly}
          maxLength={MAX_NAME_LENGTH}
          onChange={(e) => changeName(e.target.value)}
          onBlur={flushName}
          className="w-full border-none bg-transparent pt-2 pb-1 font-heading text-4xl font-extrabold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/20 focus:ring-0"
          placeholder="Untitled"
        />

        <hr className="my-2 border-border/30" />
      </div>
    </div>
  )
}
