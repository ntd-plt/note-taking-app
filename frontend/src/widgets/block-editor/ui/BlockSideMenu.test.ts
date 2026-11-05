import { describe, expect, it } from 'vitest'
import { TURN_INTO, blockTypeLabel, isTurnInto } from './BlockSideMenu'

const block = (type: string, props: Record<string, unknown> = {}) =>
  ({ type, props }) as Parameters<typeof blockTypeLabel>[0]

describe('blockTypeLabel', () => {
  it('names each type as the Turn into menu does', () => {
    expect(blockTypeLabel(block('paragraph'))).toBe('Text')
    expect(blockTypeLabel(block('heading', { level: 2 }))).toBe('Heading 2')
    expect(blockTypeLabel(block('checkListItem', { checked: true }))).toBe(
      'To-do list',
    )
    expect(blockTypeLabel(block('page'))).toBe('Page')
  })
})

describe('isTurnInto', () => {
  it('ticks exactly one option, matching a heading by its level', () => {
    const ticked = (b: ReturnType<typeof block>) =>
      TURN_INTO.filter((t) => isTurnInto(t, b)).map((t) => t.label)
    expect(ticked(block('heading', { level: 3 }))).toEqual(['Heading 3'])
    expect(ticked(block('quote'))).toEqual(['Quote'])
    expect(ticked(block('page'))).toEqual([])
  })
})
