import type { Editor } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { NODE_HOVER_PLUGIN_KEY } from '../plugins/NodeHoverExtension'
import type { NodeHoverPluginState } from '../plugins/NodeHoverExtension'

const DEFAULT_PLUGIN_STATE: NodeHoverPluginState = {
  isMouseInside: false,
  hoveredNode: null,
}

export const useNodeHoverState = (editor: Editor | null) => {
  const [pluginState, setPluginState] =
    useState<NodeHoverPluginState>(DEFAULT_PLUGIN_STATE)

  useEffect(() => {
    if (!editor) return

    const onTransaction = () => {
      const state = NODE_HOVER_PLUGIN_KEY.getState(editor.state)
      setPluginState(state ?? DEFAULT_PLUGIN_STATE)
    }

    editor.on('transaction', onTransaction)
    return () => {
      editor.off('transaction', onTransaction)
    }
  }, [editor])

  return pluginState
}
