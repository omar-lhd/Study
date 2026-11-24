import { cloudRest, cloudStorageSignedUrl, cloudStorageUpload, readCloudSession } from '@/lib/chats/cloud-client'
import { readPendingChatMessages, removePendingChatMessage } from '@/lib/chats/offline-store'

let syncing = false

export async function syncPendingChatOutbox(): Promise<void> {
  const session = readCloudSession()
  if (!session || typeof navigator === 'undefined' || !navigator.onLine || syncing) return
  syncing = true
  try {
    const pending = await readPendingChatMessages().catch(() => [])
    const owned = pending.filter(item => item.sender_id === session.user.id)
    if (!owned.length) return

    for (const item of owned) {
      try {
        try {
          await cloudRest<{ id: string }[]>('messages?select=id', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({ id: item.id, conversation_id: item.conversation_id, sender_id: session.user.id, content: item.content, message_type: item.attachment ? (item.attachment.mime_type.startsWith('image/') ? 'image' : item.attachment.mime_type.startsWith('audio/') ? 'voice' : 'file') : 'text', reply_to_message_id: item.reply_to_message_id }),
          })
        } catch (insertError) {
          const existing = await cloudRest<{ id: string }[]>(`messages?select=id&id=eq.${item.id}&sender_id=eq.${session.user.id}&limit=1`)
          if (!existing.length) throw insertError
        }

        if (item.attachment) {
          const existingAttachments = await cloudRest<{ id: string }[]>(`message_attachments?select=id&message_id=eq.${item.id}&limit=1`)
          if (!existingAttachments.length) {
            const safeName = item.attachment.file_name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'attachment'
            const storagePath = `conversations/${item.conversation_id}/${session.user.id}/${item.id}-${safeName}`
            let alreadyUploaded = false
            try { await cloudStorageSignedUrl(storagePath, 60); alreadyUploaded = true } catch { /* upload below if object is absent */ }
            if (!alreadyUploaded) await cloudStorageUpload(storagePath, item.attachment.blob)
            await cloudRest<void>('message_attachments', {
              method: 'POST',
              body: JSON.stringify({ message_id: item.id, conversation_id: item.conversation_id, storage_path: storagePath, file_name: item.attachment.file_name, mime_type: item.attachment.mime_type, file_size: item.attachment.file_size, duration_ms: item.attachment.duration_ms }),
            })
          }
        }
        await removePendingChatMessage(item.id)
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Could not sync pending messages'
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('study:offline-outbox-error', { detail: { message } }))
        break
      }
    }
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('study:offline-outbox-synced'))
  } finally {
    syncing = false
  }
}
