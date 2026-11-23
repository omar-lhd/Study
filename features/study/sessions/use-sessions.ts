'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { LOCALE_META } from '@/i18n/config'
import { usePreferences } from '@/components/providers/preferences-provider'
import { localSessionsRepository } from '@/lib/sessions/local-repository'
import { createSessionsStore } from '@/lib/sessions/store'

/** The single place that picks the adapter. Swap it here for a Supabase/Realtime one later. */
export const sessionsStore = createSessionsStore(localSessionsRepository)

export function useSessions() {
  return useSyncExternalStore(sessionsStore.subscribe, sessionsStore.getSnapshot, sessionsStore.getServerSnapshot)
}

/** Current time in ms, refreshed on an interval. Only render time-dependent UI once data is ready (client-only). */
export function useNow(intervalMs: number, enabled = true) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs, enabled])
  return now
}

export function useSessionFormatters() {
  const { locale, t } = usePreferences()
  return useMemo(() => {
    const intl = LOCALE_META[locale].intl
    const dateTime = new Intl.DateTimeFormat(intl, { dateStyle: 'medium', timeStyle: 'short' })
    const time = new Intl.DateTimeFormat(intl, { timeStyle: 'short' })
    return {
      dateTime: (ms: number) => dateTime.format(ms),
      time: (ms: number) => time.format(ms),
      minutesLabel: (minutes: number) => t('sessions.meta.minutes', { minutes }),
    }
  }, [locale, t])
}
