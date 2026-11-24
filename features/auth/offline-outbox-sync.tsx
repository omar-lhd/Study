'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { usePreferences } from '@/components/providers/preferences-provider'
import { readCloudSession, subscribeCloudSession } from '@/lib/chats/cloud-client'
import { syncPendingChatOutbox } from '@/lib/chats/offline-sync'

export function OfflineOutboxSync() {
  const session = useSyncExternalStore(subscribeCloudSession, readCloudSession, () => null)
  const { locale } = usePreferences()
  const userId = session?.user.id

  useEffect(() => {
    if (!userId) return
    const sync = () => { void syncPendingChatOutbox() }
    const onError = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message
      toast.error(locale === 'ar' ? 'في رسائل لسه ما اتبعتتش. هنحاول تاني لما الاتصال يستقر.' : 'Some messages are still waiting to send. We will retry when the connection is stable.')
      if (message) window.dispatchEvent(new CustomEvent('study:offline-outbox-last-error', { detail: { message } }))
    }
    window.addEventListener('online', sync)
    window.addEventListener('study:offline-outbox-error', onError)
    if (navigator.onLine) sync()
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('study:offline-outbox-error', onError)
    }
  }, [userId, locale])

  return null
}
