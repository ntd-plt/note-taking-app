import type { CommandProps, Editor, Range } from '@tiptap/react'
import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion'
import type { ComponentType } from 'react'

export type MenuState =
  | { status: 'closed' }
  | {
      status: 'open'
      items: SlashCommandItem[]
      selectedIndex: number
      position: { top: number; left: number }
      command: (item: SlashCommandItem) => void
    }

export interface SlashCommandItem {
  title: string
  description?: string
  keywords?: string[]
  icon: string
  command: (props: { editor: Editor; range: Range }) => void
}

export type SlashCommandOptions = {
  suggestion: Omit<SuggestionOptions<SlashCommandItem>, 'editor'>
}

export type MenuAction =
  | { type: 'OPEN'; props: SuggestionProps<SlashCommandItem> }
  | { type: 'UPDATE'; props: SuggestionProps<SlashCommandItem> }
  | { type: 'MOVE'; index: number }
  | { type: 'CLOSE' }

export interface BlockEditMenuItem {
  title: string
  description?: string
  keywords?: string[]
  icon: string | ComponentType
  command: (props?: CommandProps) => void
}

export interface BlockEditMenuItemCommandProps {
  nodePos: number
  editor: Editor
  dispatch: React.Dispatch<BlockEditMenuAction>
}

