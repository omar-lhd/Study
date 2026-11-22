import { ar, type MessageKey } from './messages/ar'
import { en } from './messages/en'

export const LOCALES = ['ar', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export type Direction = 'rtl' | 'ltr'

export const DEFAULT_LOCALE: Locale = 'ar'
export const LOCALE_COOKIE = 'psc-locale'

export const LOCALE_META: Record<Locale, { dir: Direction; intl: string }> = {
  ar: { dir: 'rtl', intl: 'ar-EG' },
  en: { dir: 'ltr', intl: 'en-US' },
}

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { ar, en }

export type { MessageKey }

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

export type Translate = (key: MessageKey, values?: Record<string, string | number>) => string

export function createTranslator(locale: Locale): Translate {
  const messages = MESSAGES[locale]
  return (key, values) => {
    const template = messages[key]
    if (!values) return template
    return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`))
  }
}
