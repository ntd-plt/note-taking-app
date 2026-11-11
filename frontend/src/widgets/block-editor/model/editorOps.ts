// Block insertions shared by the editor's drag and drop and its undo.
import type { EditorBlock, EditorPartialBlock, PageEditor } from './schema'

// appendChild puts block in as the last child of parentId.
export function appendChild(
  editor: PageEditor,
  parentId: string,
  block: EditorPartialBlock,
) {
  const parent = editor.getBlock(parentId)
  if (!parent) return
  const last = parent.children.at(-1)
  if (last) editor.insertBlocks([block], last, 'after')
  else editor.updateBlock(parent, { children: [block] })
}

// appendToDocument puts block in at the end of the page, before the trailing
// empty paragraph.
export function appendToDocument(
  editor: PageEditor,
  block: EditorPartialBlock,
) {
  const doc = editor.document
  const last = doc.at(-1)
  if (!last) editor.replaceBlocks(doc, [block])
  else if (isEmptyParagraph(last)) editor.insertBlocks([block], last, 'before')
  else editor.insertBlocks([block], last, 'after')
}

const isEmptyParagraph = (b: EditorBlock) =>
  b.type === 'paragraph' &&
  b.children.length === 0 &&
  (!Array.isArray(b.content) || b.content.length === 0)
