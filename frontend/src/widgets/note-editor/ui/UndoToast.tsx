import { toast } from 'sonner'
import { create } from 'zustand'

type ToastId = string | number

// Ids of the undo toasts that are still on screen, oldest first.
const useUndoStack = create<{
  ids: ToastId[]
  push: (id: ToastId) => void
  remove: (id: ToastId) => void
}>((set) => ({
  ids: [],
  push: (id) => set((s) => ({ ids: [...s.ids, id] })),
  remove: (id) => set((s) => ({ ids: s.ids.filter((x) => x !== id) })),
}))

/**
 * Undo is last-in, first-out: only the newest toast's button works. An older one wakes up
 * once the newer toast has been undone, dismissed or has timed out, so actions are never
 * undone out of order.
 */
function UndoButton({ id, onUndo }: { id: ToastId; onUndo: () => void }) {
  const isNewest = useUndoStack((s) => s.ids[s.ids.length - 1] === id)
  return (
    <button
      type="button"
      disabled={!isNewest}
      title={isNewest ? undefined : 'Undo the newer action first'}
      onClick={onUndo}
      className="ml-auto shrink-0 cursor-pointer rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      Undo
    </button>
  )
}

export function showUndoToast(message: string, onUndo: () => void) {
  const id: ToastId = crypto.randomUUID()
  const { push, remove } = useUndoStack.getState()
  push(id)
  toast(message, {
    id,
    action: (
      <UndoButton
        id={id}
        onUndo={() => {
          remove(id)
          toast.dismiss(id)
          onUndo()
        }}
      />
    ),
    onDismiss: () => remove(id),
    onAutoClose: () => remove(id),
  })
}
