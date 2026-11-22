import type { Metadata } from 'next'
import { ProfileView } from '@/features/profile/profile-view'
import { getServerTranslator } from '@/lib/preferences/server'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator()
  return { title: t('nav.profile') }
}

export default function ProfilePage() {
  return <ProfileView />
}
