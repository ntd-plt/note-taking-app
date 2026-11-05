// The page editor that is open, if any. Anything that changes the tree outside
// the editor (the sidebar moving or adding a page) first flushes the editor's
// pending save, so the editor's positions still match the server, and then
// invalidates the open item so the editor reloads with the change.
interface OpenEditor {
  pageId: string
  flush: () => Promise<void>
}

let current: OpenEditor | null = null

export function registerOpenEditor(editor: OpenEditor): () => void {
  current = editor
  return () => {
    if (current === editor) current = null
  }
}

export const flushOpenEditor = (): Promise<void> =>
  current?.flush() ?? Promise.resolve()
