// src/mocks/handler.ts
import { userHandlers } from '#/entities/user/api/user.handlers'
import { itemHandlers } from '#/entities/item/api/item.handlers'
import { authHandlers } from '#/features/auth/api/auth.handlers'
import { itemsHandlers } from './items.handlers'

// itemHandlers (the item tree) come before the old folder/note itemsHandlers, so
// GET /items/:id is answered by the tree for its own ids.
export const handlers = [
  ...userHandlers,
  ...authHandlers,
  ...itemHandlers,
  ...itemsHandlers,
]
