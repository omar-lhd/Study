import type { Metadata } from 'next'
import { StudyChatHub } from '@/features/chats/study-chat-hub'
import { getServerTranslator } from '@/lib/preferences/server'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator()
  return { title: t('nav.chats') }
}

export default function ChatsPage() {
  return <StudyChatHub />
}
