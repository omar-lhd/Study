import { ChatsModeGate } from './chats-mode-gate'
import { ChatsAuthPanel } from './chats-auth-panel'

export function ChatsShell() {
  return <><ChatsAuthPanel /><ChatsModeGate /></>
}
