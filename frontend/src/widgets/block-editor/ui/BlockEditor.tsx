// The BlockNote editor for one page. It loads the page's blocks once, saves
// changes through PageSaver, and never takes server data again while mounted:
// a reload means remounting it.
import * as React from 'react'
import { filterSuggestionItems } from '@blocknote/core/extensions'
import {
  SideMenuController,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
} from '@blocknote/react'
import type { DefaultReactSuggestionItem } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/shadcn'
import '@blocknote/shadcn/style.css'
import { FileText } from 'lucide-react'
import {
  DEFAULT_PAGE_ICON,
  DEFAULT_PAGE_NAME,
  registerOpenEditor,
} from '#/entities/item'
import type { OpenedItem, Op } from '#/entities/item'
import { fromBlockNote, toBlockNote } from '../model/blocks'
import type { BNBlock } from '../model/blocks'
import { PageSaver } from '../model/pageSaver'
import { schema } from '../model/schema'
import type { EditorBlock, PageEditor } from '../model/schema'
import { BlockSideMenu, DragStartContext } from './BlockSideMenu'
import { applyDrop, useBlockDrag } from './DragLayer'

// Slash menu entries for the types the server knows, by BlockNote's keys.
const SLASH_KEYS = new Set([
  'paragraph',
  'heading',
  'heading_2',
  'heading_3',
  'bullet_list',
  'numbered_list',
  'check_list',
  'toggle_list',
  'quote',
])

function slashItems(editor: PageEditor): DefaultReactSuggestionItem[] {
  const items = getDefaultReactSlashMenuItems(editor).filter((i) =>
    SLASH_KEYS.has((i as { key?: string }).key ?? ''),
  )
  items.push({
    title: 'Page',
    subtext: 'A child page inside this page',
    aliases: ['page', 'subpage'],
    group: 'Basic blocks',
    icon: <FileText size={18} />,
    onItemClick: () => {
      const at = editor.getTextCursorPosition().block
      const page = {
        id: crypto.randomUUID(),
        type: 'page' as const,
        props: { name: DEFAULT_PAGE_NAME, icon: DEFAULT_PAGE_ICON },
      }
      const empty =
        at.type === 'paragraph' &&
        Array.isArray(at.content) &&
        at.content.length === 0 &&
        at.children.length === 0
      if (empty) editor.replaceBlocks([at], [page])
      else editor.insertBlocks([page], at, 'after')
    },
  })
  return items
}

export interface BlockEditorProps {
  opened: OpenedItem
  editable: boolean
  send: (ops: Op[], refreshPages: boolean) => Promise<void>
  onSaveFailed: (err: unknown) => void
  onSavingChange: (saving: boolean) => void
  // Scrolls to and focuses this block once loaded, then calls onFocused.
  focusId?: string | null
  onFocused?: () => void
  // Hands out the editor once created (for tests and tooling).
  onReady?: (editor: PageEditor) => void
}

export function BlockEditor({
  opened,
  editable,
  send,
  onSaveFailed,
  onSavingChange,
  focusId,
  onFocused,
  onReady,
}: BlockEditorProps) {
  const pageId = opened.items[0].id
  const [initialContent] = React.useState(() => toBlockNote(opened))
  const editor = useCreateBlockNote({
    schema,
    initialContent:
      initialContent.length > 0
        ? (initialContent as unknown as EditorBlock[])
        : undefined,
    trailingBlock: true,
  })

  const onReadyRef = React.useRef(onReady)
  React.useEffect(() => {
    onReadyRef.current?.(editor)
  }, [editor])

  const callbacks = React.useRef({ send, onSaveFailed, onSavingChange })
  React.useEffect(() => {
    callbacks.current = { send, onSaveFailed, onSavingChange }
  })

  const [saver] = React.useState(
    () =>
      new PageSaver({
        saved: fromBlockNote(pageId, editor.document as unknown as BNBlock[]),
        read: () => fromBlockNote(pageId, editor.document),
        send: (ops, refresh) => callbacks.current.send(ops, refresh),
        onError: (err) => callbacks.current.onSaveFailed(err),
        onSavingChange: (s) => callbacks.current.onSavingChange(s),
      }),
  )

  React.useEffect(() => {
    const unregister = registerOpenEditor({
      pageId,
      flush: () => saver.flush(),
    })
    return () => {
      unregister()
      void saver.flush()
    }
  }, [pageId, saver])

  const drag = useBlockDrag(editor, (draggedId, drop) => {
    if (drop.kind !== 'page') {
      applyDrop(editor, draggedId, drop)
      return
    }
    // The block leaves this document: save what is pending, then send the move.
    void saver.flush().then(() => {
      if (!editor.getBlock(draggedId)) return
      editor.removeBlocks([draggedId])
      saver.moveOut(draggedId, drop.pageId)
      return saver.flush()
    })
  })

  const onFocusedRef = React.useRef(onFocused)
  React.useEffect(() => {
    onFocusedRef.current = onFocused
  })
  React.useEffect(() => {
    if (!focusId) return
    const frame = requestAnimationFrame(() => {
      if (editor.getBlock(focusId)) {
        editor.setTextCursorPosition(focusId, 'start')
        const outers =
          editor.domElement?.querySelectorAll<HTMLElement>('.bn-block-outer')
        ;[...(outers ?? [])]
          .find((el) => el.dataset.id === focusId)
          ?.scrollIntoView({ block: 'center' })
      }
      onFocusedRef.current?.()
    })
    return () => cancelAnimationFrame(frame)
  }, [editor, focusId])

  return (
    <DragStartContext.Provider value={drag.start}>
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme="light"
        sideMenu={false}
        slashMenu={false}
        onChange={() => saver.schedule()}
        className="page-editor"
      >
        {editable && <SideMenuController sideMenu={BlockSideMenu} />}
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(slashItems(editor), query)
          }
        />
      </BlockNoteView>
      {drag.overlay}
    </DragStartContext.Provider>
  )
}
