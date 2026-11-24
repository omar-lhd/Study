'use client'

import { useSyncExternalStore } from 'react'
import { ChatsExperience } from './chats-experience'
import { CloudChatsExperience } from './cloud-chats-experience'
import { readCloudSession, subscribeCloudSession } from '@/lib/chats/cloud-client'

export function ChatsModeGate() {
  const session = useSyncExternalStore(subscribeCloudSession, readCloudSession, () => null)
  return session ? <CloudChatsExperience /> : <ChatsExperience />
}
