// src/mocks/handler.ts
import { itemHandlers } from '#/entities/item/api/item.handlers'
import { authHandlers } from '#/features/auth/api/auth.handlers'

export const handlers = [...authHandlers, ...itemHandlers]
