import type { User } from '../models'
import { apiClient } from './client'

export async function getCurrentUser(): Promise<User | null> {
  try {
    const data = await apiClient.get<User>('/api/me')

    return data
  } catch (error) {
    console.error('Fail to get user data: ', error)
  }
  return null
}
