// A child page inside the document: one row with its icon and name that opens
// the page. Its content lives on the page itself, so the block has none.
import { createReactBlockSpec } from '@blocknote/react'
import { Link } from '@tanstack/react-router'
import { DEFAULT_PAGE_ICON, DEFAULT_PAGE_NAME } from '#/entities/item'

export const pageBlockSpec = createReactBlockSpec(
  {
    type: 'page',
    propSchema: {
      name: { default: DEFAULT_PAGE_NAME },
      icon: { default: DEFAULT_PAGE_ICON },
    },
    content: 'none',
  },
  {
    render: ({ block }) => (
      <Link
        to="/items/$itemId"
        params={{ itemId: block.id }}
        contentEditable={false}
        data-page-link=""
        className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 font-medium underline decoration-border underline-offset-4 hover:bg-muted/70"
      >
        <span>{block.props.icon || DEFAULT_PAGE_ICON}</span>
        <span className="truncate">
          {block.props.name || DEFAULT_PAGE_NAME}
        </span>
      </Link>
    ),
  },
)
