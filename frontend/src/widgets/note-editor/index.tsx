export { useItemsStore } from './hooks/useItemsStore'
export { type Item, type ItemType, type SidebarItem } from './model'
export { Editor } from './ui/Editor'
export { ItemBreadcrumb } from './ui/ItemBreadcrumb'
export {
  ITEMS_KEY,
  TRASH_KEY,
  useTrashQuery,
  useTrashItems,
  useRestoreItems,
  useDeleteTrashedItem,
  useEmptyTrash,
  useItemsQuery,
  useNoteContentQuery,
  useCreateItem,
  useDeleteItem,
  useDuplicateItem,
  useMoveItems,
  useUpdateItem,
  useSaveNoteContent,
} from './hooks/useItems'
