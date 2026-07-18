import { create } from 'zustand'

export const EditorState = {
  currentHoveredRow: null,
  dragHandlerState: {
    visible: false,
    position: null,
  },
  blockEditMenuState: {
    status: 'closed',
  },
  slashCommandMenuState: {
    status: 'closed',
  },
}

const useEditorStateStore = create((set) => ({
  ...EditorState,
}))
