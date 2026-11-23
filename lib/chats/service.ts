import type { ChatServices } from './types'

/**
 * Integration boundary for approved community members, conversations, messages,
 * and published stories. The current app deliberately has no implementation;
 * connecting an authorized community backend can replace this adapter without
 * changing the Chats UI.
 */
export class ChatServiceUnavailableError extends Error {
  constructor() {
    super('Community messaging services are not connected')
    this.name = 'ChatServiceUnavailableError'
  }
}

function unavailable<T>(): Promise<T> {
  return Promise.reject(new ChatServiceUnavailableError())
}

export const unavailableChatServices: ChatServices = {
  listConversations: () => unavailable(),
  listMembers: () => unavailable(),
  listMessages: () => unavailable(),
  startConversation: () => unavailable(),
  sendMessage: () => unavailable(),
  listStories: () => unavailable(),
  publishStory: () => unavailable(),
}
