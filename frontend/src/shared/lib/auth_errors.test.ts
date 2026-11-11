import { describe, expect, it } from 'vitest'
import { ApiError } from '@/shared/api/client'
import { getAuthErrorMessage } from './auth_errors'

describe('getAuthErrorMessage', () => {
  const badRequest = new ApiError(400, 'password must be 6 to 72 bytes long')

  it('keeps the generic text for a 400 by default (login)', () => {
    expect(getAuthErrorMessage(badRequest)).toBe(
      'Please fill in a valid email and password.',
    )
  })

  it("shows the server's message for a 400 when asked (signup)", () => {
    expect(getAuthErrorMessage(badRequest, { serverMessageFor400: true })).toBe(
      'password must be 6 to 72 bytes long',
    )
  })

  it('still maps other statuses to friendly text', () => {
    expect(
      getAuthErrorMessage(new ApiError(409, 'the email already exists'), {
        serverMessageFor400: true,
      }),
    ).toBe('An account with this email already exists.')
  })
})
