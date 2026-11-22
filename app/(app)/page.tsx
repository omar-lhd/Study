import type { Metadata } from 'next'
import { TodayView } from '@/features/home/today-view'
import { getServerTranslator } from '@/lib/preferences/server'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator()
  return { title: t('nav.home') }
}

export default function HomePage() {
  return <TodayView />
}
