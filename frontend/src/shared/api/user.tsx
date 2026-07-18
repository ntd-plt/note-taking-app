import type { User } from '../models'
import { validateSession } from './auth'

export async function getCurrentUser(): Promise<User | null> {
  try {
    const auth = await validateSession()
    return auth.user
  } catch (error) {
    console.error('Fail to get user data: ', error)
  }
  return null
}
