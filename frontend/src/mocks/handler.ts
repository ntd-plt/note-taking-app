// src/mocks/handler.ts
import { userHandlers } from '#/entities/user/api/user.handlers'
import { authHandlers } from '#/features/auth/api/auth.handlers'
import { foldersHandlers } from './folders.handlers'
import { notesHandlers } from './notes.handlers'

export const handlers = [
  ...userHandlers,
  ...authHandlers,
  ...foldersHandlers,
  ...notesHandlers,
]
