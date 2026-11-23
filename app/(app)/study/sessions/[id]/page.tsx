import type { Metadata } from 'next'
import { SessionRoom } from '@/features/study/sessions/session-room'
import { getServerTranslator } from '@/lib/preferences/server'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator()
  return { title: t('sessions.room.timer') }
}

export default async function SessionRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <SessionRoom id={id} />
}
