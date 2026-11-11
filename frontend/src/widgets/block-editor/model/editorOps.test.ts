import { describe, expect, it } from 'vitest'
import { BlockNoteEditor } from '@blocknote/core'
import { appendChild, appendToDocument } from './editorOps'
import { schema } from './schema'
import type { EditorPartialBlock, PageEditor } from './schema'

const p = (id: string, text = id): EditorPartialBlock => ({
  id,
  type: 'paragraph',
  content: text,
})

const editorWith = (blocks: EditorPartialBlock[]) =>
  BlockNoteEditor.create({ schema, initialContent: blocks })

const ids = (editor: PageEditor) => editor.document.map((b) => b.id)

describe('appendChild', () => {
  it('adds the first child', () => {
    const editor = editorWith([p('a')])
    appendChild(editor, 'a', p('x'))
    expect(editor.getBlock('a')!.children.map((b) => b.id)).toEqual(['x'])
  })

  it('adds after the last child', () => {
    const editor = editorWith([{ ...p('a'), children: [p('b')] }])
    appendChild(editor, 'a', p('x'))
    expect(editor.getBlock('a')!.children.map((b) => b.id)).toEqual(['b', 'x'])
  })

  it('does nothing when the parent is gone', () => {
    const editor = editorWith([p('a')])
    appendChild(editor, 'missing', p('x'))
    expect(editor.getBlock('x')).toBeUndefined()
  })
})

describe('appendToDocument', () => {
  it('goes before the trailing empty paragraph', () => {
    const editor = editorWith([p('a'), p('empty', '')])
    appendToDocument(editor, p('x'))
    expect(ids(editor)).toEqual(['a', 'x', 'empty'])
  })

  it('goes last when the page does not end with an empty paragraph', () => {
    const editor = editorWith([p('a')])
    appendToDocument(editor, p('x'))
    expect(ids(editor)).toEqual(['a', 'x'])
  })
})
