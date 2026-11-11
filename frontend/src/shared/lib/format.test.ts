import { describe, expect, it } from 'vitest'
import { formatDate } from './format'

describe('formatDate', () => {
  const s = '2026-11-11T13:05:00'

  it('shows the date', () => {
    expect(formatDate(s)).toBe('Nov 11, 2026')
  })

  it('adds the time when asked', () => {
    expect(formatDate(s, { time: true })).toBe('Nov 11, 2026, 01:05 PM')
  })
})
