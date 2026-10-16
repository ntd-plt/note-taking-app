import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Toaster } from '@/components/ui/sonner'
import { showUndoToast } from './UndoToast'

afterEach(() => {
  act(() => {
    toast.dismiss()
  })
  cleanup()
})

const undoButtons = () => screen.findAllByRole('button', { name: 'Undo' })

// Sonner lists the newest toast first.
async function twoToasts() {
  const first = vi.fn()
  const second = vi.fn()
  render(<Toaster />)
  act(() => {
    showUndoToast('First', first)
  })
  await screen.findByText('First')
  act(() => {
    showUndoToast('Second', second)
  })
  await screen.findByText('Second')
  await waitFor(async () => expect(await undoButtons()).toHaveLength(2))
  return { first, second }
}

const buttonOf = async (label: string) => {
  const item = (await screen.findByText(label)).closest('li')!
  return item.querySelector('button')!
}

describe('undo toasts', () => {
  it('lets only the newest toast be undone', async () => {
    const { first, second } = await twoToasts()
    const older = await buttonOf('First')
    const newer = await buttonOf('Second')

    expect(newer.disabled).toBe(false)
    expect(older.disabled).toBe(true)

    older.click()
    expect(first).not.toHaveBeenCalled()
    expect(second).not.toHaveBeenCalled()
  })

  it('wakes the older toast once the newer one has been undone', async () => {
    const { first, second } = await twoToasts()

    const newer = await buttonOf('Second')
    act(() => newer.click())
    expect(second).toHaveBeenCalledTimes(1)

    await waitFor(async () =>
      expect((await buttonOf('First')).disabled).toBe(false),
    )
    const older = await buttonOf('First')
    act(() => older.click())
    expect(first).toHaveBeenCalledTimes(1)
  })

  it('wakes the older toast when the newer one goes away without being undone', async () => {
    const { first, second } = await twoToasts()
    expect((await buttonOf('First')).disabled).toBe(true)

    // The newest toast is the last one sonner knows about.
    const newest = toast.getToasts().at(-1)!
    act(() => {
      toast.dismiss(newest.id)
    })

    await waitFor(async () =>
      expect((await buttonOf('First')).disabled).toBe(false),
    )
    expect(second).not.toHaveBeenCalled()
    expect(first).not.toHaveBeenCalled()
  })
})
