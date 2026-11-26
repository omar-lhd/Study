import { ChatsExperience } from './chats-experience'

export function ChatsShell({ initialView = 'inbox' }: { initialView?: 'inbox' | 'notes' | 'members' }) {
  return <ChatsExperience initialView={initialView} />
}
