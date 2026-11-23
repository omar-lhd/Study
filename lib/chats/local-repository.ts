import type { ChatMessage, StoryDraft } from './types'
import { LOCAL_NOTES_CONVERSATION_ID } from './types'

const MESSAGES_KEY = 'psc:chats-private-notes:v1'
const STORY_DRAFT_KEY = 'psc:chats-story-drafts:v1'

export class ChatsStorageError extends Error {
  constructor(
    public readonly kind: 'read' | 'write',
    cause?: unknown,
  ) {
    super(kind === 'read' ? 'Could not read local chat data' : 'Could not save local chat data', { cause })
    this.name = 'ChatsStorageError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readJson(key: string): unknown {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(key)
  } catch (error) {
    throw new ChatsStorageError('read', error)
  }
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new ChatsStorageError('read', error)
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    throw new ChatsStorageError('write', error)
  }
}

function parseMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== 'string' ||
    value.conversationId !== LOCAL_NOTES_CONVERSATION_ID ||
    typeof value.senderId !== 'string' ||
    typeof value.text !== 'string' ||
    typeof value.createdAt !== 'number' ||
    !Number.isFinite(value.createdAt)
  ) {
    return null
  }
  const reactions = Array.isArray(value.reactions)
    ? value.reactions.filter(
        (item): item is { emoji: string; memberId: string } =>
          isRecord(item) && typeof item.emoji === 'string' && typeof item.memberId === 'string',
      )
    : []
  return {
    id: value.id,
    conversationId: value.conversationId,
    senderId: value.senderId,
    text: value.text,
    createdAt: value.createdAt,
    replyToMessageId: typeof value.replyToMessageId === 'string' ? value.replyToMessageId : null,
    reactions,
    attachments: [],
  }
}

function parseDraft(value: unknown): StoryDraft | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== 'string' ||
    typeof value.text !== 'string' ||
    typeof value.createdAt !== 'number' ||
    (value.audience !== 'community' && value.audience !== 'selected-members')
  ) {
    return null
  }
  const audienceMemberIds = Array.isArray(value.audienceMemberIds)
    ? value.audienceMemberIds.filter((id): id is string => typeof id === 'string')
    : []
  return {
    id: value.id,
    text: value.text,
    createdAt: value.createdAt,
    audience: value.audience,
    audienceMemberIds,
    status: 'draft',
  }
}

export const localChatsRepository = {
  async listPrivateNotes(): Promise<ChatMessage[]> {
    const data = readJson(MESSAGES_KEY)
    return Array.isArray(data) ? data.map(parseMessage).filter((message): message is ChatMessage => message !== null) : []
  },

  async savePrivateNote(message: ChatMessage): Promise<void> {
    const messages = await this.listPrivateNotes()
    const index = messages.findIndex((item) => item.id === message.id)
    if (index === -1) messages.push(message)
    else messages[index] = message
    writeJson(MESSAGES_KEY, messages)
  },

  async listStoryDrafts(): Promise<StoryDraft[]> {
    const data = readJson(STORY_DRAFT_KEY)
    return Array.isArray(data) ? data.map(parseDraft).filter((draft): draft is StoryDraft => draft !== null) : []
  },

  async saveStoryDraft(draft: StoryDraft): Promise<void> {
    const drafts = await this.listStoryDrafts()
    const index = drafts.findIndex((item) => item.id === draft.id)
    if (index === -1) drafts.unshift(draft)
    else drafts[index] = draft
    writeJson(STORY_DRAFT_KEY, drafts)
  },

  subscribe(onExternalChange: () => void): () => void {
    const handler = (event: StorageEvent) => {
      if (event.key === MESSAGES_KEY || event.key === STORY_DRAFT_KEY || event.key === null) onExternalChange()
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  },
}
