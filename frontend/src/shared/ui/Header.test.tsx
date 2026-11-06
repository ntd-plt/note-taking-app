import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsDialog } from '#/shared/lib/settingsDialog'
import { useTheme } from '#/shared/lib/theme'
import { Header } from './Header'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    activeProps: _activeProps,
    ...rest
  }: {
    children: ReactNode
    to: string
    activeProps?: unknown
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

const user = { name: 'Ada', email: 'ada@example.com' }

beforeEach(() => {
  localStorage.clear()
  useTheme.setState({ preference: 'system', resolved: 'light' })
  useSettingsDialog.setState({ open: false, section: 'appearance' })
})

describe('Header', () => {
  it('hides Settings from logged-out visitors', () => {
    render(<Header user={null} />)

    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Theme' })).toBeTruthy()
  })

  it('opens the settings popup from the nav when logged in', () => {
    vi.useFakeTimers()
    try {
      render(<Header user={user} />)
      const nav = screen.getByRole('navigation', { name: 'Main' })

      fireEvent.click(within(nav).getByRole('button', { name: 'Settings' }))
      act(() => vi.runAllTimers())

      expect(useSettingsDialog.getState().open).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('picks a theme from the sun/moon menu', async () => {
    render(<Header user={null} />)

    fireEvent.keyDown(screen.getByRole('button', { name: 'Theme' }), {
      key: 'Enter',
    })
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Dark' }))

    expect(useTheme.getState().preference).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
  })
})
