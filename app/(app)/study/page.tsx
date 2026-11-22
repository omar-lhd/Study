import type { Metadata } from 'next'
import { StudyView } from '@/features/study/study-view'
import { getServerTranslator } from '@/lib/preferences/server'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator()
  return { title: t('nav.study') }
}

export default function StudyPage() {
  return <StudyView />
}
