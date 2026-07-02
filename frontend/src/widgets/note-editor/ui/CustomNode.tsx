import { Node, mergeAttributes } from '@tiptap/core'
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from '@tiptap/react'
import { useLayoutEffect, useRef, useState } from 'react'

export function ColumnContainer({ node }: ReactNodeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [childWidths, setChildWidths] = useState<number[]>([])

  const columns = node.attrs.columns || '1fr 1fr'
  const numColumns = columns.split(' ').length

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      const contentWrapper = container.querySelector(
        '[data-node-view-content-react]',
      )
      if (!contentWrapper) return

      const cells = Array.from(contentWrapper.children)
      const newWidths = cells.map((el) => el.getBoundingClientRect().width)

      setChildWidths((prevWidths) => {
        const isSame =
          prevWidths.length === newWidths.length &&
          prevWidths.every((w, idx) => w === newWidths[idx])
        return isSame ? prevWidths : newWidths
      })
    })
    observer.observe(container)

    return () => observer.disconnect()
  }, [])

  // Calculate handle positions centered in the gaps
  const gap = 16 // 1rem in pixels
  const handlePositions = []
  
  if (childWidths.length === numColumns) {
    let accumulatedWidth = 0
    for (let i = 0; i < childWidths.length - 1; i++) {
      accumulatedWidth += childWidths[i]
      const handlePos = accumulatedWidth + gap * i + gap / 2
      handlePositions.push(handlePos)
    }
  }

  return (
    <NodeViewWrapper
      ref={containerRef}
      className="custom-layout-grid relative group"
      style={{
        display: 'grid',
        gridTemplateColumns: columns,
        gap: `${gap}px`,
      }}
    >
      <NodeViewContent />

      {/* Render vertical resize handles */}
      {handlePositions.map((pos, index) => (
        <div
          key={index}
          className="absolute top-0 bottom-0 w-4 -ml-2 cursor-col-resize flex items-center justify-center group/handle select-none pointer-events-auto"
          style={{
            left: `${pos}px`,
            zIndex: 10,
          }}
        >
          {/* Thin line that highlights on hover */}
          <div className="w-[2px] h-full bg-border group-hover/handle:bg-primary/80 transition-colors duration-150 relative">
            {/* Elegant drag pill in the middle */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-6 rounded-full bg-background border border-border group-hover/handle:border-primary/80 flex flex-col items-center justify-center gap-[2px] opacity-0 group-hover/handle:opacity-100 transition-opacity duration-150 shadow-sm">
              <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/60 group-hover/handle:bg-primary/80" />
              <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/60 group-hover/handle:bg-primary/80" />
              <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/60 group-hover/handle:bg-primary/80" />
            </div>
          </div>
        </div>
      ))}
    </NodeViewWrapper>
  )
}

export const CustomLayout = Node.create({
  name: 'customLayout',
  group: 'block',
  content: 'layoutCell+',
  defining: true,
  addAttributes() {
    return {
      columns: {
        default: '1fr 1fr',
        parseHTML: (element) => element.getAttribute('data-columns'),
        renderHTML: (attributes) => ({ 'data-columns': attributes.columns }),
      },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-type="custom-layout"]',
      },
    ]
  },
  renderHTML({ node, HTMLAttributes }) {
    const columnLayout = node.attrs.columns
    console.log(columnLayout)
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'custom-layout',
        style: `display: grid; grid-template-columns: ${columnLayout}; gap: 1rem;`,
      }),
      0,
    ]
  },
  addNodeView() {
    return ReactNodeViewRenderer(ColumnContainer)
  },
})

export const LayoutCell = Node.create({
  name: 'layoutCell',
  content: 'block+', // Allows any standard block node (paragraphs, images, headings) inside
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="layout-cell"]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'layout-cell' }),
      0,
    ]
  },
})
