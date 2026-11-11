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
import { showUndoToast } from '#/shared/ui/undoToast'
import { useTheme } from '#/shared/lib/theme'
import {
  DEFAULT_PAGE_ICON,
  DEFAULT_PAGE_NAME,
  registerOpenEditor,
  restoreFromTrash,
} from '#/entities/item'
import type { OpenedItem, Op } from '#/entities/item'
import { useLatest } from '#/shared/hooks/useLatest'
import { fromBlockNote, toBlockNote } from '../model/blocks'
import { appendChild, appendToDocument } from '../model/editorOps'
import type { BNBlock } from '../model/blocks'
import { PageSaver } from '../model/pageSaver'
import type { TrashedBlock } from '../model/pageSaver'
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

// putBack re-inserts a trashed child page block at the end of its old parent:
// as the last child of the block it was in, or at the end of the page (before
// the trailing empty paragraph) when it was top-level or that block is gone. The
// next save sees the page block again and restores the page.
function putBack(editor: PageEditor, pageId: string, t: TrashedBlock) {
  if (editor.getBlock(t.id)) return
  const block = {
    id: t.id,
    type: 'page' as const,
    props: t.props as { name: string; icon: string },
  }
  if (t.parentId !== pageId && editor.getBlock(t.parentId))
    appendChild(editor, t.parentId, block)
  else appendToDocument(editor, block)
}

export interface BlockEditorProps {
  opened: OpenedItem
  editable: boolean
  send: (ops: Op[]) => Promise<void>
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
  const theme = useTheme((s) => s.resolved)
  const [initialContent] = React.useState(() => toBlockNote(opened))
  const editor = useCreateBlockNote({
    schema,
    initialContent:
      initialContent.length > 0
        ? (initialContent as unknown as EditorBlock[])
        : undefined,
    trailingBlock: true,
  })

  const onReadyRef = useLatest(onReady)
  React.useEffect(() => {
    onReadyRef.current?.(editor)
  }, [editor, onReadyRef])

  const callbacks = useLatest({ send, onSaveFailed, onSavingChange })

  // A child page removed in the editor goes to the trash on the next save; the
  // toast offers to put it back. Once the editor is gone, Undo restores the
  // pages to the top level instead.
  const mounted = React.useRef(true)
  React.useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const onTrashed = (pages: TrashedBlock[]) => {
    const name = (t: TrashedBlock) =>
      typeof t.props.name === 'string' ? t.props.name : DEFAULT_PAGE_NAME
    showUndoToast(
      pages.length === 1
        ? `Moved "${name(pages[0])}" to the trash`
        : `Moved ${pages.length} pages to the trash`,
      () => {
        if (mounted.current) {
          editor.transact(() => {
            for (const t of pages) putBack(editor, pageId, t)
          })
          void saver.flush()
        } else {
          void Promise.all(pages.map((t) => restoreFromTrash(t.id)))
        }
      },
    )
  }
  const onTrashedRef = useLatest(onTrashed)

  const [saver] = React.useState(
    () =>
      new PageSaver({
        saved: fromBlockNote(pageId, editor.document as unknown as BNBlock[]),
        read: () => fromBlockNote(pageId, editor.document),
        send: (ops) => callbacks.current.send(ops),
        onError: (err) => callbacks.current.onSaveFailed(err),
        onSavingChange: (s) => callbacks.current.onSavingChange(s),
        onTrashed: (pages) => onTrashedRef.current(pages),
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

  const onFocusedRef = useLatest(onFocused)
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
  }, [editor, focusId, onFocusedRef])

  return (
    <DragStartContext.Provider value={drag.start}>
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme={theme}
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
