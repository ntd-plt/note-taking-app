// The editor schema: only the block types the server knows, plus a `page` block
// for child pages. BlockNote keys every block type by the same names the server
// uses, so a block's type goes to and from the server unchanged.
import {
  BlockNoteSchema,
  createBulletListItemBlockSpec,
  createCheckListItemBlockSpec,
  createHeadingBlockSpec,
  createNumberedListItemBlockSpec,
  createParagraphBlockSpec,
  createQuoteBlockSpec,
  createToggleListItemBlockSpec,
} from '@blocknote/core'
import { pageBlockSpec } from '../ui/PageBlock'

export const HEADING_LEVELS = [1, 2, 3] as const

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: createParagraphBlockSpec(),
    heading: createHeadingBlockSpec({
      levels: HEADING_LEVELS,
      defaultLevel: 1,
    }),
    bulletListItem: createBulletListItemBlockSpec(),
    numberedListItem: createNumberedListItemBlockSpec(),
    checkListItem: createCheckListItemBlockSpec(),
    toggleListItem: createToggleListItemBlockSpec(),
    quote: createQuoteBlockSpec(),
    page: pageBlockSpec(),
  },
})

export type EditorSchema = typeof schema
export type PageEditor = typeof schema.BlockNoteEditor
export type EditorBlock = typeof schema.Block
