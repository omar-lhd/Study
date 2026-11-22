'use server'

import { cookies } from 'next/headers'
import { LOCALE_COOKIE, isLocale } from '@/i18n/config'
import { THEME_COOKIE, isTheme } from './config'

const ONE_YEAR = 60 * 60 * 24 * 365

const cookieOptions = {
  path: '/',
  maxAge: ONE_YEAR,
  sameSite: 'lax' as const,
}

export async function setLocaleAction(value: string) {
  if (!isLocale(value)) return
  ;(await cookies()).set(LOCALE_COOKIE, value, cookieOptions)
}

export async function setThemeAction(value: string) {
  if (!isTheme(value)) return
  ;(await cookies()).set(THEME_COOKIE, value, cookieOptions)
}
