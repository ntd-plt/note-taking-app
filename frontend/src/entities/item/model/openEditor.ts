// What the open page has not saved yet. Anything that changes the tree outside
// the editor (the sidebar moving, adding or trashing a page) first flushes it,
// so the editor's positions still match the server and no edit is lost, and
// then invalidates the open item so the editor reloads with the change. The
// block editor and the page title each register their own pending save.
interface PendingSave {
  pageId: string
  flush: () => Promise<void>
}

const open = new Set<PendingSave>()

export function registerOpenEditor(save: PendingSave): () => void {
  open.add(save)
  return () => {
    open.delete(save)
  }
}

export const flushOpenEditor = async (): Promise<void> => {
  await Promise.all([...open].map((s) => s.flush()))
}
