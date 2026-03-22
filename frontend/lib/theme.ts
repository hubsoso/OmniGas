import { useCallback, useEffect, useState } from 'react'

export type ThemeMode = 'system' | 'dark' | 'light'
export type ResolvedTheme = 'dark' | 'light'

export const THEME_ORDER: ThemeMode[] = ['system', 'dark', 'light']

const STORAGE_KEY = 'wallet-theme'
const THEME_EVENT = 'wallet-theme-change'

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'system' || value === 'dark' || value === 'light'
}

export function getStoredTheme(): ThemeMode | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isThemeMode(stored) ? stored : null
  } catch {
    return null
  }
}

export function getSystemDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveTheme(mode: ThemeMode, systemDark: boolean): ResolvedTheme {
  if (mode === 'dark') return 'dark'
  if (mode === 'light') return 'light'
  return systemDark ? 'dark' : 'light'
}

export function applyTheme(mode: ThemeMode, systemDark = getSystemDark()): ResolvedTheme {
  if (typeof document === 'undefined') {
    return resolveTheme(mode, systemDark)
  }

  const resolved = resolveTheme(mode, systemDark)
  const root = document.documentElement
  const body = document.body

  root.dataset.theme = resolved
  root.dataset.themeMode = mode
  root.style.colorScheme = resolved

  if (body) {
    body.dataset.theme = resolved
    body.style.colorScheme = resolved
  }

  return resolved
}

export function persistTheme(mode: ThemeMode) {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, mode)
    } catch {}
  }

  const systemDark = getSystemDark()
  applyTheme(mode, systemDark)

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { mode, systemDark } }))
  }
}

function getInitialThemeState() {
  const themeMode =
    typeof document !== 'undefined' && isThemeMode(document.documentElement.dataset.themeMode ?? null)
      ? (document.documentElement.dataset.themeMode as ThemeMode)
      : (getStoredTheme() ?? 'system')
  const systemDark =
    typeof document !== 'undefined'
      ? document.documentElement.dataset.theme === 'dark'
      : getSystemDark()

  return {
    themeMode,
    systemDark,
  }
}

export function useThemeMode() {
  const [{ themeMode, systemDark }, setThemeState] = useState(getInitialThemeState)

  useEffect(() => {
    const syncTheme = () => {
      const nextThemeMode = getStoredTheme() ?? 'system'
      const nextSystemDark = getSystemDark()

      setThemeState({
        themeMode: nextThemeMode,
        systemDark: nextSystemDark,
      })
      applyTheme(nextThemeMode, nextSystemDark)
    }

    syncTheme()

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      const nextThemeMode = getStoredTheme() ?? 'system'
      setThemeState({
        themeMode: nextThemeMode,
        systemDark: event.matches,
      })
      applyTheme(nextThemeMode, event.matches)
    }

    const handleThemeChange = () => {
      syncTheme()
    }

    mediaQuery.addEventListener('change', handleSystemThemeChange)
    window.addEventListener(THEME_EVENT, handleThemeChange)
    window.addEventListener('storage', handleThemeChange)

    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange)
      window.removeEventListener(THEME_EVENT, handleThemeChange)
      window.removeEventListener('storage', handleThemeChange)
    }
  }, [])

  const setThemeMode = useCallback((nextThemeMode: ThemeMode) => {
    setThemeState({
      themeMode: nextThemeMode,
      systemDark: getSystemDark(),
    })
    persistTheme(nextThemeMode)
  }, [])

  return {
    themeMode,
    systemDark,
    isLight: resolveTheme(themeMode, systemDark) === 'light',
    setThemeMode,
  }
}
