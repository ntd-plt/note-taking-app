import { BubbleMenu as TiptapBubbleMenu } from '@tiptap/react/menus'
import { type Editor } from '@tiptap/react'
import { Bold, Italic, Strikethrough, Code } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Separator } from '#/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip'

export function BubbleMenuButton({
  isActive,
  icon: Icon,
  tooltip,
  iconClass,
  onClick,
  ariaLabel,
}: {
  isActive: boolean
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  tooltip?: string
  ariaLabel?: string
  iconClass?: string
  onClick?: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={isActive ? 'secondary' : 'ghost'}
          size="icon-xs"
          onClick={() => onClick?.()}
          className={
            isActive
              ? 'bg-secondary text-secondary-foreground cursor-pointer'
              : 'text-muted-foreground cursor-pointer'
          }
          aria-label={ariaLabel}
        >
          <Icon className={iconClass ?? ''} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" align="center">
        {tooltip ?? ''}
      </TooltipContent>
    </Tooltip>
  )
}

export function BubbleMenu({ editor }: { editor: Editor }) {
  if (!editor) return null

  return (
    <TiptapBubbleMenu
      editor={editor}
      tippyOptions={{
        duration: 150,
        animation: 'shift-toward',
      }}
    >
      <TooltipProvider delayDuration={400}>
        <div className="flex items-center gap-1 rounded-sm border border-border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95 duration-200">
          <BubbleMenuButton
            icon={Bold}
            tooltip="Bold"
            ariaLabel="Toggle Bold"
            iconClass="h-3.5 w-3.5"
            isActive={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
          <BubbleMenuButton
            icon={Italic}
            tooltip="Italic"
            iconClass="h-3.5 w-3.5"
            ariaLabel="Toggle Italic"
            isActive={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
          <BubbleMenuButton
            icon={Strikethrough}
            tooltip="Strikethrough"
            iconClass="h-3.5 w-3.5"
            ariaLabel="Toggle Strikethrough"
            isActive={editor.isActive('strikethrough')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />

          <Separator orientation="vertical" className="h-4 mx-1" />

          <BubbleMenuButton
            icon={Code}
            iconClass="h-3.5 w-3.5"
            tooltip="Code"
            isActive={editor.isActive('code')}
            ariaLabel="Toggle Code"
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
        </div>
      </TooltipProvider>
    </TiptapBubbleMenu>
  )
}
