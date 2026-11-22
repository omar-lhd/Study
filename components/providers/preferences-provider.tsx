'use client'

import { createContext, useContext, useMemo, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  LOCALE_META,
  createTranslator,
  type Direction,
  type Locale,
  type Translate,
} from '@/i18n/config'
import { setLocaleAction, setThemeAction } from '@/lib/preferences/actions'
import type { Theme } from '@/lib/preferences/config'

interface PreferencesContextValue {
  locale: Locale
  dir: Direction
  theme: Theme
  t: Translate
  pending: boolean
  setLocale: (locale: Locale) => void
  setTheme: (theme: Theme) => void
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

interface Props {
  locale: Locale
  theme: Theme
  children: ReactNode
}

export function PreferencesProvider({ locale, theme: initialTheme, children }: Props) {
  const router = useRouter()
  const [theme, setThemeState] = useState(initialTheme)
  const [pending, startTransition] = useTransition()

  const value = useMemo<PreferencesContextValue>(() => {
    const t = createTranslator(locale)

    return {
      locale,
      dir: LOCALE_META[locale].dir,
      theme,
      t,
      pending,
      setLocale: (next) => {
        if (next === locale) return
        startTransition(async () => {
          await setLocaleAction(next)
          router.refresh()
          toast.success(createTranslator(next)('common.saved'))
        })
      },
      setTheme: (next) => {
        if (next === theme) return
        setThemeState(next)
        document.documentElement.classList.toggle('light', next === 'light')
        startTransition(async () => {
          await setThemeAction(next)
          toast.success(t('common.saved'))
        })
      },
    }
  }, [locale, theme, pending, router])

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider')
  return ctx
}

export function useT() {
  return usePreferences().t
}
