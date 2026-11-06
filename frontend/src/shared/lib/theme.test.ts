import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as Theme from './theme'

type ThemeModule = typeof Theme

// A matchMedia whose dark-mode answer the test controls, and which tells its
// listeners when the test flips it, as the OS would.
function fakeSystemTheme(initiallyDark: boolean) {
  let dark = initiallyDark
  const listeners = new Set<() => void>()
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    get matches() {
      return query === '(prefers-color-scheme: dark)' && dark
    },
    media: query,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  }))
  return {
    set(next: boolean) {
      dark = next
      listeners.forEach((l) => l())
    },
  }
}

const root = document.documentElement
const themeColor = () =>
  document.querySelector('meta[name="theme-color"]')?.getAttribute('content')

let stop: (() => void) | undefined

// Loads a fresh copy of the module, so the store reads localStorage anew.
async function start(): Promise<ThemeModule> {
  vi.resetModules()
  const mod = await import('./theme')
  stop = mod.startThemeSync()
  return mod
}

beforeEach(() => {
  localStorage.clear()
  root.className = ''
  root.style.colorScheme = ''
  document.head.innerHTML = '<meta name="theme-color" content="#ffffff">'
})

afterEach(() => {
  stop?.()
  stop = undefined
})

describe('theme', () => {
  it('follows the OS when nothing is saved', async () => {
    fakeSystemTheme(true)
    const { useTheme } = await start()

    expect(useTheme.getState().preference).toBe('system')
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.style.colorScheme).toBe('dark')
    expect(themeColor()).toBe('#0c0a09')
  })

  it('treats an unknown saved value as system', async () => {
    fakeSystemTheme(false)
    localStorage.setItem('theme', 'purple')
    const { useTheme } = await start()

    expect(useTheme.getState().preference).toBe('system')
    expect(useTheme.getState().resolved).toBe('light')
  })

  it('applies and saves a pick', async () => {
    fakeSystemTheme(false)
    const { useTheme } = await start()

    useTheme.getState().setPreference('dark')

    expect(localStorage.getItem('theme')).toBe('dark')
    expect(root.classList.contains('dark')).toBe(true)
    expect(themeColor()).toBe('#0c0a09')

    useTheme.getState().setPreference('light')
    expect(root.classList.contains('dark')).toBe(false)
    expect(root.style.colorScheme).toBe('light')
    expect(themeColor()).toBe('#ffffff')
  })

  it('follows OS changes only while the pick is system', async () => {
    const os = fakeSystemTheme(false)
    const { useTheme } = await start()

    os.set(true)
    expect(root.classList.contains('dark')).toBe(true)

    useTheme.getState().setPreference('light')
    os.set(false)
    os.set(true)
    expect(root.classList.contains('dark')).toBe(false)
  })

  it('takes a pick saved in another tab', async () => {
    fakeSystemTheme(false)
    const { useTheme } = await start()

    localStorage.setItem('theme', 'dark')
    window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))

    expect(useTheme.getState().preference).toBe('dark')
    expect(root.classList.contains('dark')).toBe(true)
  })

  it('turns transitions off only for the swap', async () => {
    vi.useFakeTimers()
    try {
      fakeSystemTheme(false)
      const { useTheme } = await start()
      vi.runAllTimers()

      useTheme.getState().setPreference('dark')
      expect(root.classList.contains('theme-switching')).toBe(true)
      vi.runAllTimers()
      expect(root.classList.contains('theme-switching')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})

// The inline script in index.html runs before the app and must reach the same
// theme as the store, or the page flashes or opens in the wrong theme.
describe('index.html theme script', () => {
  const html = readFileSync(
    path.resolve(__dirname, '../../../index.html'),
    'utf8',
  )
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1]

  const cases: Array<[string | null, boolean]> = [
    [null, false],
    [null, true],
    ['light', true],
    ['dark', false],
    ['system', true],
    ['purple', true],
  ]

  it.each(cases)('saved %s, OS dark %s', async (saved, osDark) => {
    expect(script).toBeDefined()
    fakeSystemTheme(osDark)
    if (saved !== null) localStorage.setItem('theme', saved)

    new Function(script!)()
    const fromScript = {
      dark: root.classList.contains('dark'),
      scheme: root.style.colorScheme,
      color: themeColor(),
    }

    root.className = ''
    await start()
    expect(fromScript).toEqual({
      dark: root.classList.contains('dark'),
      scheme: root.style.colorScheme,
      color: themeColor(),
    })
  })
})
