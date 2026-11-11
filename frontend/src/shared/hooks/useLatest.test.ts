import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLatest } from './useLatest'

describe('useLatest', () => {
  it('keeps one ref holding the latest value', () => {
    const { result, rerender } = renderHook(({ v }) => useLatest(v), {
      initialProps: { v: 1 },
    })
    const ref = result.current
    rerender({ v: 2 })
    expect(result.current).toBe(ref)
    expect(ref.current).toBe(2)
  })
})
