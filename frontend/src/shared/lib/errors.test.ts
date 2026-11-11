import { describe, expect, it } from 'vitest'
import { errorMessage } from './errors'

describe('errorMessage', () => {
  it("returns an Error's message", () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
  })

  it('returns an empty string for anything else', () => {
    expect(errorMessage('boom')).toBe('')
    expect(errorMessage(undefined)).toBe('')
  })
})
