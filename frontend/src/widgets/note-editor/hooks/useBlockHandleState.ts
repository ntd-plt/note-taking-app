import type { Editor } from '@tiptap/react'
import { useEffect, useState } from 'react'
import {
  BLOCK_HANDLE_PLUGIN_KEY,
  type BlockHandlePluginState,
} from '../plugins/BlockHandleExtension'

const DEFAULT_PLUGIN_STATE: BlockHandlePluginState = {
  isMouseInside: false,
  hoveredNode: null,
}

export const useBlockHandleState = (editor: Editor | null) => {
  const [pluginState, setPluginState] =
    useState<BlockHandlePluginState>(DEFAULT_PLUGIN_STATE)

  useEffect(() => {
    if (!editor) return

    const onTransaction = () => {
      const state = BLOCK_HANDLE_PLUGIN_KEY.getState(editor.state)
      setPluginState(state ?? DEFAULT_PLUGIN_STATE)
    }

    editor.on('transaction', onTransaction)
    return () => {
      editor.off('transaction', onTransaction)
    }
  }, [editor])
  return pluginState
}
