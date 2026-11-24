import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_STORY_IMAGE_BYTES,
  formatMediaDuration,
  validateChatMedia,
  validateStoryImage,
} from './validation.ts'

describe('chat media validation', () => {
  it('accepts supported image, PDF and text attachments', () => {
    assert.equal(validateChatMedia({ type: 'image/jpeg', size: 1024 }), null)
    assert.equal(validateChatMedia({ type: 'application/pdf', size: 1024 }), null)
    assert.equal(validateChatMedia({ type: 'text/plain', size: 1024 }), null)
  })

  it('rejects unsupported types and accepts audio only for voice notes', () => {
    assert.equal(validateChatMedia({ type: 'application/zip', size: 100 }), 'fileTypeInvalid')
    assert.equal(validateChatMedia({ type: 'audio/webm', size: 100 }), 'fileTypeInvalid')
    assert.equal(validateChatMedia({ type: 'audio/webm', size: 100 }, true), null)
    assert.equal(validateChatMedia({ type: 'image/png', size: 100 }, true), 'fileTypeInvalid')
  })

  it('enforces the attachment limit at the boundary', () => {
    assert.equal(validateChatMedia({ type: 'application/pdf', size: MAX_CHAT_ATTACHMENT_BYTES }), null)
    assert.equal(validateChatMedia({ type: 'application/pdf', size: MAX_CHAT_ATTACHMENT_BYTES + 1 }), 'fileTooLarge')
  })
})

describe('Story image validation', () => {
  it('requires an image and enforces the Story upload limit', () => {
    assert.equal(validateStoryImage({ type: 'text/plain', size: 10 }), 'imageTypeInvalid')
    assert.equal(validateStoryImage({ type: 'image/webp', size: MAX_STORY_IMAGE_BYTES }), null)
    assert.equal(validateStoryImage({ type: 'image/png', size: MAX_STORY_IMAGE_BYTES + 1 }), 'imageTooLarge')
  })
})

describe('voice duration formatting', () => {
  it('formats zero, minute and hour durations without negative time', () => {
    assert.equal(formatMediaDuration(0), '0:00')
    assert.equal(formatMediaDuration(65_000), '1:05')
    assert.equal(formatMediaDuration(3_725_000), '62:05')
    assert.equal(formatMediaDuration(-10_000), '0:00')
  })
})
