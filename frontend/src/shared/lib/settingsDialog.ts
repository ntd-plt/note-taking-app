// Whether the settings popup is open, and on which section. It lives in shared
// so anything can open it (the sidebar menu, the landing Header); the popup
// itself is the settings-dialog widget, mounted once in the root route. It is
// not in the URL: reloading or going back does not reopen it.
import { create } from 'zustand'

export type SettingsSection = 'appearance'

interface SettingsDialogState {
  open: boolean
  section: SettingsSection
  setOpen: (open: boolean) => void
  setSection: (section: SettingsSection) => void
}

export const useSettingsDialog = create<SettingsDialogState>((set) => ({
  open: false,
  section: 'appearance',
  setOpen: (open) => set({ open }),
  setSection: (section) => set({ section }),
}))

// openSettings opens the popup on a section. It waits a tick, so a dropdown
// menu that opened it has closed and handed focus back first: otherwise the
// menu's cleanup can run after the dialog mounts and leave the page
// unclickable, and Esc would return focus to nothing.
export function openSettings(section: SettingsSection = 'appearance') {
  setTimeout(() => useSettingsDialog.setState({ open: true, section }), 0)
}
