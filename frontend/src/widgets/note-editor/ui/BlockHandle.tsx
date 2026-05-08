import { useRef } from 'react'
import { useBlockEdit, type HoveredNodeData } from './BlockEditProvider'
import { Button } from '@/components/ui/button'
import { GripVertical } from 'lucide-react'

export function BlockHandle({
  hoverPos,
  mouseInside,
}: {
  hoverPos: HoveredNodeData | null
  mouseInside: boolean
}) {
  const rect = hoverPos?.rect
  const { dispatch } = useBlockEdit()
  const dom = useRef<HTMLDivElement>(null)
  const height = dom.current?.getBoundingClientRect().height ?? 0
  const width = dom.current?.getBoundingClientRect().width ?? 0
  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: rect?.top ?? 0,
          left: rect?.left ?? 0,
          width: 0,
          height: 0,
          pointerEvents: 'none',
        }}
        aria-hidden
        className="absolute -left-6 opacity-0 group-hover:opacity-100"
      ></div>
      <div
        ref={dom}
        className="text"
        style={{
          opacity: !mouseInside ? 0 : rect ? 100 : 0,
          position: 'fixed',
          top: (rect?.top ?? 0) + (rect?.height ?? 0) / 2 - height / 2,
          left: (rect?.left ?? 0) - 15 - width / 2,
          zIndex: rect ? 50 : -50,
        }}
      >
        <Button
          variant="ghost"
          size="icon-xs"
          className="py-4"
          onClick={() => {
            dispatch({ type: 'OPEN' })
          }}
        >
          <GripVertical strokeWidth={2} className="size-4 opacity-75" />
        </Button>
      </div>
    </>
  )
}
