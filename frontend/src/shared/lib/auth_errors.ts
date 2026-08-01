import { ApiError } from '@/shared/api/client'

const AUTH_ERROR_MESSAGES: Record<number, string> = {
  400: 'Please fill in a valid email and password.',
  401: 'Incorrect email or password.',
  409: 'An account with this email already exists.',
  422: 'The email address looks invalid or undeliverable.',
  500: 'Something went wrong on our end. Please try again shortly.',
}

const DEFAULT_AUTH_ERROR_MESSAGE = 'Something went wrong. Please try again.'

export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return AUTH_ERROR_MESSAGES[error.status] ?? error.message
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return DEFAULT_AUTH_ERROR_MESSAGE
}
