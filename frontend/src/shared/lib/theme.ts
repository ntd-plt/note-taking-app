// The color theme: what the user picked (light, dark or follow the OS) and what
// that resolves to now. The pick is saved per browser in localStorage. The
// inline script in index.html applies it before first paint, so keep the key,
// the values and the colors here in step with that script.
import { create } from 'zustand'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'theme'
export const DARK_QUERY = '(prefers-color-scheme: dark)'
// The browser chrome color (<meta name="theme-color">): the --background of
// each theme in styles.css.
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: '#ffffff',
  dark: '#0c0a09',
}

const PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system']

// readPreference returns the saved pick, or 'system' when there is none or it
// is not one we know.
export function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    return PREFERENCES.includes(saved as ThemePreference)
      ? (saved as ThemePreference)
      : 'system'
  } catch {
    return 'system'
  }
}

function systemIsDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') return systemIsDark() ? 'dark' : 'light'
  return preference
}

interface ThemeState {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
}

export const useTheme = create<ThemeState>((set) => {
  const preference = readPreference()
  return {
    preference,
    resolved: resolveTheme(preference),
    setPreference: (next) => {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next)
      } catch {
        // Storage can be full or blocked; the theme still applies this visit.
      }
      set({ preference: next, resolved: resolveTheme(next) })
    },
  }
})

// applyTheme puts the theme on the page: the .dark class, the color-scheme for
// native scrollbars and inputs, and the browser chrome color. Transitions are
// off for the swap, so hover/transition-all elements don't fade in one by one.
export function applyTheme(theme: ResolvedTheme) {
  const root = document.documentElement
  root.classList.add('theme-switching')
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLORS[theme])
  // Reading a style makes the browser apply the new colors now, while
  // transitions are still off; then they come back.
  void window.getComputedStyle(root).opacity
  setTimeout(() => root.classList.remove('theme-switching'), 0)
}

// startThemeSync applies the theme and keeps it applied: when the pick changes,
// when the OS theme changes while the pick is 'system', and when another tab
// saves a new pick. Call it once at startup; it returns a cleanup for tests.
export function startThemeSync(): () => void {
  const { preference } = useTheme.getState()
  useTheme.setState({ resolved: resolveTheme(preference) })
  applyTheme(useTheme.getState().resolved)

  const unsubscribe = useTheme.subscribe((state, prev) => {
    if (state.resolved !== prev.resolved) applyTheme(state.resolved)
  })

  const media = window.matchMedia(DARK_QUERY)
  const onSystemChange = () => {
    const state = useTheme.getState()
    if (state.preference === 'system')
      useTheme.setState({ resolved: resolveTheme('system') })
  }
  media.addEventListener('change', onSystemChange)

  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return
    const next = readPreference()
    useTheme.setState({ preference: next, resolved: resolveTheme(next) })
  }
  window.addEventListener('storage', onStorage)

  return () => {
    unsubscribe()
    media.removeEventListener('change', onSystemChange)
    window.removeEventListener('storage', onStorage)
  }
}
