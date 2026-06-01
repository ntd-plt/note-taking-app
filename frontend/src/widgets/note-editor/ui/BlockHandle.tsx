import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { GripVertical } from 'lucide-react'
import { useBlockEditMenuStore } from '../state/useBlockEditMenuStore'

export function BlockHandle({ rect }: { rect: DOMRect | null }) {
  const dispatch = useBlockEditMenuStore((s) => s.dispatch)
  const domRef = useRef<HTMLDivElement>(null)

  const handleHeight = domRef.current?.getBoundingClientRect().height ?? 0
  const handleWidth = domRef.current?.getBoundingClientRect().width ?? 0

  return (
    <div
      ref={domRef}
      style={{
        position: 'fixed',
        top: (rect?.top ?? 0) + (rect?.height ?? 0) / 2 - handleHeight / 2,
        left: (rect?.left ?? 0) - 15 - handleWidth / 2,
        opacity: rect ? 1 : 0,
        pointerEvents: rect ? 'auto' : 'none',
        zIndex: rect ? 50 : -1,
        transition: 'opacity 0.15s ease',
      }}
    >
      <Button
        variant="ghost"
        size="icon-xs"
        className="py-4"
        onClick={() => dispatch({ type: 'OPEN' })}
      >
        <GripVertical strokeWidth={2} className="size-4 opacity-75" />
      </Button>
    </div>
  )
}
