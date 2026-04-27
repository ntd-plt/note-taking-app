// SlashCommandExtension.ts
import { Extension } from '@tiptap/core'
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion'
import type { SlashCommandItem, SlashCommandOptions } from '../model'
import { EditorState, Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const ghostKey = new PluginKey<{ suggestion: string }>('ghostText')

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        startOfLine: false,
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
      new Plugin({
        key: new PluginKey('ghostText'),
        state: {
          init(_config, state) {
            return { suggestion: 'Type / to open command menu…' }
          },
          apply(tr, prev) {
            const suggestion = tr.getMeta(ghostKey)
            return suggestion !== undefined ? { suggestion } : prev
          },
        },
        props: {
          handleKeyDown(view, event) {
            // const { suggestion } = ghostKey.getState(view.state)!

            // Any other key clears ghost (except modifier keys)
            if (
              // suggestion &&
              !['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)
            ) {
              view.dispatch(view.state.tr.setMeta(ghostKey, ''))
            }

            return false
          },

          decorations(state) {
            const isOnEmptyLine = checkEmptyLine(state)

            const { selection } = state
            const pos = selection.$head.pos

            const ghost = document.createElement('span')
            ghost.className = 'ghost-text italic text-sm'
            if (isOnEmptyLine) {
              ghost.textContent = 'Type / to open command menu…'
            } else {
              ghost.textContent = ''
            }
            ghost.style.cssText =
              'opacity: 0.4; pointer-events: none; user-select: none;'

            return DecorationSet.create(state.doc, [
              Decoration.widget(pos, ghost, { side: 1 }),
            ])
          },
        },
      }),
    ]
  },
})

function checkEmptyLine(state: EditorState): boolean {
  const { $head } = state.selection
  // Get the current block node (paragraph, heading, etc.)
  const node = $head.parent
  return node.textContent === ''
}

// ─── Default command list ─────────────────────────────────────────────────────

export const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    title: 'Heading 1',
    description: 'Large section heading',
    keywords: ['h1', 'heading', 'title'],
    icon: 'H1',
    command: ({ editor, range }) => {
      console.log('Range', range)
      // props.command({ editor, range })
      console.log(editor.getHTML())
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode('heading', { level: 1 })
        .run()
    },
  },
  {
    title: 'Heading 2',
    description: 'Medium section heading',
    keywords: ['h2', 'heading', 'subtitle'],
    icon: 'H2',
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleHeading({ level: 2 })
        .run()
    },
  },
  {
    title: 'Heading 3',
    description: 'Small section heading',
    keywords: ['h3', 'heading'],
    icon: 'H3',
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleHeading({ level: 3 })
        .run()
    },
  },
  {
    title: 'Bullet list',
    description: 'Unordered list of items',
    keywords: ['ul', 'list', 'bullet', 'unordered'],
    icon: '•—',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    title: 'Numbered list',
    description: 'Ordered list of items',
    keywords: ['ol', 'list', 'ordered', 'number'],
    icon: '1.',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    title: 'Blockquote',
    description: 'Highlighted quote block',
    keywords: ['quote', 'blockquote', 'cite'],
    icon: '❝',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
  },
  {
    title: 'Code block',
    description: 'Monospace code block',
    keywords: ['code', 'pre', 'monospace'],
    icon: '</>',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
    },
  },
  {
    title: 'Horizontal rule',
    description: 'Visual divider between sections',
    keywords: ['hr', 'divider', 'separator', 'rule'],
    icon: '──',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run()
    },
  },
]
