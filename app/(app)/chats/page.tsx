import type { Metadata } from 'next'
import { StudyChatHub } from '@/features/chats/study-chat-hub'
import { ChatsShell } from '@/features/chats/chats-shell'
import { getServerTranslator } from '@/lib/preferences/server'

type ChatsPageProps = {
  searchParams: Promise<{ view?: string }>
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator()
  return { title: t('nav.chats') }
}

export default async function ChatsPage({ searchParams }: ChatsPageProps) {
  const params = await searchParams
  if (params.view === 'notes') return <ChatsShell initialView="notes" />
  return <StudyChatHub />
}
