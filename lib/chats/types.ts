export type ConversationKind = 'direct' | 'group' | 'self'
export type MessageAttachmentKind = 'image' | 'file' | 'voice'
export type StoryAudience = 'community' | 'selected-members'

export interface CommunityMember {
  id: string
  displayName: string
  username: string | null
  avatarUrl: string | null
  communityId: string
  isApproved: boolean
}

export interface ConversationSummary {
  id: string
  kind: ConversationKind
  memberIds: string[]
  title: string
  lastMessage: string | null
  lastActivityAt: number | null
  unreadCount: number
  muted: boolean
  pinned: boolean
}

export interface MessageReaction {
  emoji: string
  memberId: string
}

export interface ChatMessage {
  id: string
  conversationId: string
  senderId: string
  text: string
  createdAt: number
  replyToMessageId: string | null
  reactions: MessageReaction[]
  attachments: Array<{ kind: MessageAttachmentKind; name: string }>
}

export interface CommunityStory {
  id: string
  ownerId: string
  text: string
  createdAt: number
  expiresAt: number
  audience: StoryAudience
  audienceMemberIds: string[]
  media: Array<{ kind: 'image'; url: string }>
  seenByMemberIds: string[]
}

export interface StoryDraft {
  id: string
  text: string
  createdAt: number
  audience: StoryAudience
  audienceMemberIds: string[]
  status: 'draft'
}

export interface StartConversationInput {
  kind: 'direct' | 'group'
  memberIds: string[]
  title?: string
}

export interface ChatServices {
  listConversations(): Promise<ConversationSummary[]>
  listMembers(query: string): Promise<CommunityMember[]>
  listMessages(conversationId: string): Promise<ChatMessage[]>
  startConversation(input: StartConversationInput): Promise<ConversationSummary>
  sendMessage(message: ChatMessage): Promise<void>
  listStories(): Promise<CommunityStory[]>
  publishStory(draft: StoryDraft): Promise<CommunityStory>
}

export const LOCAL_NOTES_CONVERSATION_ID = 'psc:private-notes'
export const LOCAL_NOTES_SENDER_ID = 'psc:current-device-user'

export const PRIVATE_NOTES_CONVERSATION: ConversationSummary = {
  id: LOCAL_NOTES_CONVERSATION_ID,
  kind: 'self',
  memberIds: [],
  title: 'Private notes',
  lastMessage: null,
  lastActivityAt: null,
  unreadCount: 0,
  muted: false,
  pinned: true,
}
