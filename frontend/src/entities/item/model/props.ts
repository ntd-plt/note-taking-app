import type { Item } from './types'

// Prop keys the server relies on (see backend/internal/model/props.go).
export const PROP = {
  name: 'name',
  icon: 'icon',
  isFavorite: 'is_favorite',
  content: 'content',
  level: 'level',
  checked: 'checked',
} as const

export const DEFAULT_PAGE_NAME = 'New Page'
export const DEFAULT_PAGE_ICON = '📄'
export const MAX_NAME_LENGTH = 255
export const MAX_ICON_LENGTH = 32

export const pageName = (it: Item): string => {
  const v = it.props[PROP.name]
  return typeof v === 'string' ? v : DEFAULT_PAGE_NAME
}

export const pageIcon = (it: Item): string => {
  const v = it.props[PROP.icon]
  return typeof v === 'string' && v !== '' ? v : DEFAULT_PAGE_ICON
}

export const isFavorite = (it: Item): boolean =>
  it.props[PROP.isFavorite] === true
