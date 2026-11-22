import type { Metadata } from 'next'
import { ChatsShell } from '@/features/chats/chats-shell'
import { getServerTranslator } from '@/lib/preferences/server'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator()
  return { title: t('nav.chats') }
}

export default function ChatsPage() {
  return <ChatsShell />
}
