import type { Metadata } from 'next'
import { NotificationsView } from '@/features/notifications/notifications-view'
import { getServerTranslator } from '@/lib/preferences/server'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator()
  return { title: t('nav.notifications') }
}

export default function NotificationsPage() {
  return <NotificationsView />
}
