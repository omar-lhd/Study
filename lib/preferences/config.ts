export const THEMES = ['dark', 'light'] as const
export type Theme = (typeof THEMES)[number]

export const DEFAULT_THEME: Theme = 'dark'
export const THEME_COOKIE = 'psc-theme'

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}
