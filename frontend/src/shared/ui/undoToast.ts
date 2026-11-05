// The "moved to the trash" toast with its Undo button. There is only ever one:
// a newer one replaces the one showing, so its Undo is for the latest removal.
import { toast } from 'sonner'

export const UNDO_TOAST_ID = 'undo-trash'

export function showUndoToast(message: string, onUndo: () => void) {
  toast.success(message, {
    id: UNDO_TOAST_ID,
    action: { label: 'Undo', onClick: onUndo },
  })
}
