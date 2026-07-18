// SlashCommandExtension.ts
import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import type { SlashCommandItem, SlashCommandOptions } from '../model'
import { SLASH_COMMANDS } from '../data/commands'

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        startOfLine: true,
        allowSpaces: false,

        items: ({ query }): SlashCommandItem[] =>
          SLASH_COMMANDS.filter(
            (item) =>
              item.title.toLowerCase().includes(query.toLowerCase()) ||
              item.keywords?.some((kw) =>
                kw.toLowerCase().includes(query.toLowerCase()),
              ),
          ).slice(0, 10),

        command: ({ editor, range, props }) => {
          props.command({ editor, range })
        },
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ]
  },
})

// ─── Default command list ─────────────────────────────────────────────────────
