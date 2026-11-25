export type PendingChatMessage = {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  created_at: string
  reply_to_message_id: string | null
  attachment?: { blob: Blob; file_name: string; mime_type: string; file_size: number; duration_ms: number | null }
}

type CachedRecord = { id: string; conversation_id: string; value: unknown; cached_at: number }

const DB_NAME = 'study-chat-offline'
const DB_VERSION = 1
const CACHE_STORE = 'messages'
const OUTBOX_STORE = 'outbox'
const SNAPSHOT_STORE = 'snapshots'

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Offline storage is not supported in this browser'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        const store = db.createObjectStore(CACHE_STORE, { keyPath: 'id' })
        store.createIndex('conversation_id', 'conversation_id', { unique: false })
      }
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        const store = db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' })
        store.createIndex('conversation_id', 'conversation_id', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open offline message storage'))
    request.onblocked = () => reject(new Error('Offline message storage is busy in another tab'))
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Offline storage request failed'))
  })
}

export async function cacheConversationMessages<T extends { id: string; conversation_id: string }>(messages: T[]): Promise<void> {
  if (!messages.length) return
  const db = await openDatabase()
  try {
    const tx = db.transaction(CACHE_STORE, 'readwrite')
    const store = tx.objectStore(CACHE_STORE)
    const now = Date.now()
    for (const message of messages) store.put({ id: message.id, conversation_id: message.conversation_id, value: message, cached_at: now } satisfies CachedRecord)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Could not cache messages'))
      tx.onabort = () => reject(tx.error ?? new Error('Message cache transaction aborted'))
    })
  } finally { db.close() }
}

export async function readCachedConversationMessages<T>(conversationId: string): Promise<T[]> {
  const db = await openDatabase()
  try {
    const tx = db.transaction(CACHE_STORE, 'readonly')
    const request = tx.objectStore(CACHE_STORE).index('conversation_id').getAll(IDBKeyRange.only(conversationId))
    const rows = await requestResult<CachedRecord[]>(request)
    return rows.sort((a, b) => {
      const av = (a.value as { created_at?: string }).created_at ?? ''
      const bv = (b.value as { created_at?: string }).created_at ?? ''
      return av.localeCompare(bv)
    }).map(row => row.value as T)
  } finally { db.close() }
}

export async function enqueuePendingChatMessage(message: PendingChatMessage): Promise<void> {
  const db = await openDatabase()
  try {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite')
    tx.objectStore(OUTBOX_STORE).put(message)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Could not save pending message'))
      tx.onabort = () => reject(tx.error ?? new Error('Pending message transaction aborted'))
    })
  } finally { db.close() }
}

export async function readPendingChatMessages(conversationId?: string): Promise<PendingChatMessage[]> {
  const db = await openDatabase()
  try {
    const tx = db.transaction(OUTBOX_STORE, 'readonly')
    const store = tx.objectStore(OUTBOX_STORE)
    const request = conversationId
      ? store.index('conversation_id').getAll(IDBKeyRange.only(conversationId))
      : store.getAll()
    return await requestResult<PendingChatMessage[]>(request)
  } finally { db.close() }
}

export async function removePendingChatMessage(id: string): Promise<void> {
  const db = await openDatabase()
  try {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite')
    tx.objectStore(OUTBOX_STORE).delete(id)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Could not remove sent message from outbox'))
      tx.onabort = () => reject(tx.error ?? new Error('Outbox transaction aborted'))
    })
  } finally { db.close() }
}

export async function writeOfflineSnapshot<T>(key: string, value: T): Promise<void> {
  const db = await openDatabase()
  try {
    const tx = db.transaction(SNAPSHOT_STORE, 'readwrite')
    tx.objectStore(SNAPSHOT_STORE).put({ key, value, updated_at: Date.now() })
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Could not save offline snapshot'))
      tx.onabort = () => reject(tx.error ?? new Error('Offline snapshot transaction aborted'))
    })
  } finally { db.close() }
}

export async function readOfflineSnapshot<T>(key: string): Promise<T | null> {
  const db = await openDatabase()
  try {
    const tx = db.transaction(SNAPSHOT_STORE, 'readonly')
    const row = await requestResult<{ key: string; value: T } | undefined>(tx.objectStore(SNAPSHOT_STORE).get(key))
    return row?.value ?? null
  } finally { db.close() }
}
