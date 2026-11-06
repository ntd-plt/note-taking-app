import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openSettings, useSettingsDialog } from '#/shared/lib/settingsDialog'
import { startThemeSync, useTheme } from '#/shared/lib/theme'
import { SettingsDialog } from './SettingsDialog'

let stopTheme: () => void

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
  useTheme.setState({ preference: 'system', resolved: 'light' })
  useSettingsDialog.setState({ open: false, section: 'appearance' })
  stopTheme = startThemeSync()
})

afterEach(() => stopTheme())

async function openDialog() {
  render(<SettingsDialog />)
  act(() => openSettings())
  return screen.findByRole('dialog', { name: 'Settings' })
}

describe('SettingsDialog', () => {
  it('is closed until opened', () => {
    render(<SettingsDialog />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens on Appearance with the current theme picked', async () => {
    await openDialog()

    expect(
      screen
        .getByRole('button', { name: 'Appearance' })
        .getAttribute('aria-current'),
    ).toBe('page')
    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeTruthy()
    expect(
      screen
        .getByRole('radio', { name: 'System' })
        .getAttribute('aria-checked'),
    ).toBe('true')
  })

  it('applies and saves a theme at once', async () => {
    await openDialog()

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))

    expect(localStorage.getItem('theme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(
      screen.getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked'),
    ).toBe('true')
  })

  it('keeps the theme when the current option is clicked again', async () => {
    await openDialog()

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))

    expect(useTheme.getState().preference).toBe('dark')
  })

  it('closes on Escape', async () => {
    const dialog = await openDialog()

    fireEvent.keyDown(dialog, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useSettingsDialog.getState().open).toBe(false)
  })
})
