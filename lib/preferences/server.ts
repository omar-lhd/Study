import 'server-only'
import { cookies } from 'next/headers'
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  createTranslator,
  isLocale,
  type Locale,
} from '@/i18n/config'
import { DEFAULT_THEME, THEME_COOKIE, isTheme, type Theme } from './config'

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : DEFAULT_LOCALE
}

export async function getTheme(): Promise<Theme> {
  const value = (await cookies()).get(THEME_COOKIE)?.value
  return isTheme(value) ? value : DEFAULT_THEME
}

export async function getServerTranslator() {
  const locale = await getLocale()
  return { locale, t: createTranslator(locale) }
}
