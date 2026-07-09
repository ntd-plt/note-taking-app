// src/mocks/handler.ts
import { userHandlers } from '#/entities/user/api/user.handlers'
import { authHandlers } from '#/features/auth/api/auth.handlers'

export const handlers = [
  ...userHandlers,
  ...authHandlers,
]
