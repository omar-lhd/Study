export const MAX_CHAT_ATTACHMENT_BYTES = 50 * 1024 * 1024
export const MAX_STORY_IMAGE_BYTES = 10 * 1024 * 1024

export type ChatMediaValidationError = 'fileTypeInvalid' | 'fileTooLarge'
export type StoryImageValidationError = 'imageTypeInvalid' | 'imageTooLarge'

export function validateChatMedia(
  media: Pick<Blob, 'type' | 'size'>,
  isVoiceMessage = false,
): ChatMediaValidationError | null {
  const allowed = isVoiceMessage
    ? media.type.startsWith('audio/')
    : media.type.startsWith('image/') || media.type === 'application/pdf' || media.type === 'text/plain'

  if (!allowed) return 'fileTypeInvalid'
  if (media.size > MAX_CHAT_ATTACHMENT_BYTES) return 'fileTooLarge'
  return null
}

export function validateStoryImage(
  image: Pick<Blob, 'type' | 'size'>,
): StoryImageValidationError | null {
  if (!image.type.startsWith('image/')) return 'imageTypeInvalid'
  if (image.size > MAX_STORY_IMAGE_BYTES) return 'imageTooLarge'
  return null
}

export function formatMediaDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}
