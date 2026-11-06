import { Toaster as Sonner } from 'sonner'
import type { ToasterProps } from 'sonner'

const Toaster = (props: ToasterProps) => (
  <Sonner
    className="toaster group"
    style={
      {
        '--normal-bg': 'var(--popover)',
        '--normal-text': 'var(--popover-foreground)',
        '--normal-border': 'var(--border)',
        // Same corners as the menus and popovers (rounded-2xl).
        '--border-radius': 'calc(var(--radius) * 1.8)',
      } as React.CSSProperties
    }
    {...props}
  />
)

export { Toaster }
