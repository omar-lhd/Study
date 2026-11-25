export interface CloudAuthSession {
  access_token: string
  refresh_token: string
  expires_at: number
  user: { id: string; email?: string }
}

const STORAGE_KEY = 'psc:supabase-auth:v1'
const SESSION_EVENT = 'psc:supabase-auth-change'
let cachedRaw: string | null | undefined
let cachedSession: CloudAuthSession | null = null

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase public environment variables are not configured')
  return { url, key }
}

export function readCloudSession(): CloudAuthSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === cachedRaw) return cachedSession
    cachedRaw = raw
    if (!raw) { cachedSession = null; return null }
    const session = JSON.parse(raw) as CloudAuthSession
    cachedSession = session.access_token && session.refresh_token && session.user?.id ? session : null
    return cachedSession
  } catch {
    cachedRaw = null
    cachedSession = null
    return null
  }
}

function writeCloudSession(session: CloudAuthSession | null) {
  if (typeof window === 'undefined') return
  if (session) {
    const raw = JSON.stringify(session)
    window.localStorage.setItem(STORAGE_KEY, raw)
    cachedRaw = raw
    cachedSession = session
  } else {
    window.localStorage.removeItem(STORAGE_KEY)
    cachedRaw = null
    cachedSession = null
  }
  window.dispatchEvent(new Event(SESSION_EVENT))
}

export function subscribeCloudSession(listener: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(SESSION_EVENT, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(SESSION_EVENT, listener)
    window.removeEventListener('storage', listener)
  }
}

async function authRequest(path: string, body: Record<string, unknown>) {
  const { url, key } = config()
  const response = await fetch(`${url}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = data.message ?? data.msg ?? data.error_description
    throw new Error(typeof message === 'string' ? message : 'Authentication request failed')
  }
  return data
}



type AuthResponse = { access_token?: string; refresh_token?: string; expires_at?: number; expires_in?: number; user?: { id: string; email?: string } }

function sessionFromAuthResponse(data: AuthResponse): CloudAuthSession {
  if (!data.access_token || !data.refresh_token || !data.user?.id) {
    throw new Error('Supabase did not return an active session. Turn off email confirmations for password sign-up, then try again.')
  }
  const session: CloudAuthSession = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: typeof data.expires_at === 'number' ? data.expires_at : Math.floor(Date.now() / 1000) + Number(data.expires_in ?? 3600),
    user: data.user,
  }
  writeCloudSession(session)
  return session
}

export async function signUpWithPassword(email: string, password: string): Promise<CloudAuthSession | null> {
  const data = await authRequest('signup', { email: email.trim().toLowerCase(), password })
  // With Confirm email enabled, Supabase creates the user and sends a confirmation
  // code but intentionally does not issue a session until the code is verified.
  if (!data.access_token || !data.refresh_token || !data.user?.id) return null
  return sessionFromAuthResponse(data)
}

export async function signInWithPassword(email: string, password: string): Promise<CloudAuthSession> {
  const data = await authRequest('token?grant_type=password', { email: email.trim().toLowerCase(), password })
  return sessionFromAuthResponse(data)
}

export async function requestEmailOtp(email: string, createUser = false) {
  // Supabase uses the configured Site URL (often localhost in development) unless
  // redirect_to is supplied. Bind the email link to the exact app origin in use,
  // including the deployed Vercel preview domain.
  const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined
  const redirectQuery = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : ''
  await authRequest(`otp${redirectQuery}`, { email: email.trim().toLowerCase(), create_user: createUser })
}

export async function verifyEmailOtp(email: string, token: string): Promise<CloudAuthSession> {
  const data = await authRequest('verify', { email: email.trim().toLowerCase(), token: token.trim(), type: 'email' })
  if (!data.access_token || !data.refresh_token || !data.user?.id) {
    throw new Error('Supabase did not return a valid session')
  }
  const session: CloudAuthSession = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: typeof data.expires_at === 'number' ? data.expires_at : Math.floor(Date.now() / 1000) + Number(data.expires_in ?? 3600),
    user: data.user,
  }
  writeCloudSession(session)
  return session
}

export function signOutCloud() {
  const session = readCloudSession()
  if (session) {
    const { url, key } = config()
    void fetch(`${url}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${session.access_token}` },
    }).catch(() => {})
  }
  writeCloudSession(null)
}

async function getValidSession(): Promise<CloudAuthSession> {
  let session = readCloudSession()
  if (!session) throw new Error('Sign in with your approved community email first')
  if (typeof navigator !== 'undefined' && !navigator.onLine) return session
  if (session.expires_at > Math.floor(Date.now() / 1000) + 600) return session
  const { url, key } = config()
  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.access_token || !data.refresh_token) {
    writeCloudSession(null)
    throw new Error('Your sign-in expired. Please sign in again.')
  }
  session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: typeof data.expires_at === 'number' ? data.expires_at : Math.floor(Date.now() / 1000) + Number(data.expires_in ?? 3600),
    user: data.user ?? session.user,
  }
  writeCloudSession(session)
  return session
}

export async function cloudRest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, key } = config()
  const session = await getValidSession()
  const headers = new Headers(init.headers)
  headers.set('apikey', key)
  headers.set('Authorization', `Bearer ${session.access_token}`)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    const message = data.message ?? data.details ?? data.hint
    throw new Error(typeof message === 'string' ? message : `Community request failed (${response.status})`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function cloudStorageUpload(storagePath: string, file: Blob): Promise<void> {
  const { url, key } = config()
  const session = await getValidSession()
  const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/')
  const response = await fetch(`${url}/storage/v1/object/chat-media/${encodedPath}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'false',
    },
    body: file,
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    const message = data.message ?? data.error ?? data.error_description
    throw new Error(typeof message === 'string' ? message : `Attachment upload failed (${response.status})`)
  }
}

export async function cloudStorageUploadWithProgress(
  storagePath: string,
  file: Blob,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const { url, key } = config()
  const session = await getValidSession()
  const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/')

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const abort = () => xhr.abort()

    if (signal?.aborted) {
      reject(new DOMException('Attachment upload cancelled', 'AbortError'))
      return
    }

    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100)
        resolve()
        return
      }
      let data: Record<string, unknown> = {}
      try { data = JSON.parse(xhr.responseText) as Record<string, unknown> } catch { /* use status fallback */ }
      const message = typeof data.message === 'string' ? data.message : typeof data.error === 'string' ? data.error : `Attachment upload failed (${xhr.status})`
      reject(new Error(message))
    }
    xhr.onerror = () => reject(new Error('Attachment upload failed due to a network error'))
    xhr.onabort = () => reject(new DOMException('Attachment upload cancelled', 'AbortError'))
    signal?.addEventListener('abort', abort, { once: true })
    xhr.onloadend = () => signal?.removeEventListener('abort', abort)
    xhr.open('POST', `${url}/storage/v1/object/chat-media/${encodedPath}`)
    xhr.setRequestHeader('apikey', key)
    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.send(file)
  })
}

export async function cloudStorageSignedUrls(storagePaths: string[], expiresIn = 3600): Promise<Record<string, string>> {
  const paths = [...new Set(storagePaths.filter(Boolean))]
  if (!paths.length) return {}
  const { url, key } = config()
  const session = await getValidSession()
  const response = await fetch(`${url}/storage/v1/object/sign/chat-media`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths, expiresIn }),
  })
  const payload = await response.json().catch(() => null)
  const data = Array.isArray(payload) ? payload : payload && Array.isArray(payload.data) ? payload.data : null
  if (!response.ok || !data) {
    const message = payload && typeof payload.message === 'string' ? payload.message : `Could not create attachment links (${response.status})`
    throw new Error(message)
  }
  const signed: Record<string, string> = {}
  for (const item of data as Array<{ path?: string; signedURL?: string }>) {
    if (!item.path || !item.signedURL) continue
    const path = item.path.split('/').filter(Boolean).join('/')
    let relativeUrl = item.signedURL
    if (!relativeUrl.startsWith('http')) {
      const segments = relativeUrl.split('/').filter(Boolean)
      if (segments[0] === 'storage' && segments[1] === 'v1') segments.splice(0, 2)
      relativeUrl = segments.join('/')
    }
    signed[path] = new URL(relativeUrl, `${url}/storage/v1/`).toString()
  }
  return signed
}

export async function cloudStorageSignedUrl(storagePath: string, expiresIn = 3600): Promise<string> {
  const { url, key } = config()
  const session = await getValidSession()
  const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/')
  const response = await fetch(`${url}/storage/v1/object/sign/chat-media/${encodedPath}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || typeof data.signedURL !== 'string') {
    const message = data.message ?? data.error
    throw new Error(typeof message === 'string' ? message : `Could not create attachment link (${response.status})`)
  }
  return new URL(data.signedURL, `${url}/storage/v1/`).toString()
}

export async function cloudStorageRemove(storagePath: string): Promise<void> {
  const { url, key } = config()
  const session = await getValidSession()
  const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/')
  const response = await fetch(`${url}/storage/v1/object/chat-media/${encodedPath}`, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: `Bearer ${session.access_token}` },
  })
  if (!response.ok && response.status !== 404) throw new Error(`Could not remove attachment (${response.status})`)
}

export interface ConversationRealtimeCallbacks {
  onMessage?: () => void
  onTyping?: (userId: string, typing: boolean) => void
  onPresence?: (userIds: string[]) => void
  onStatus?: (connected: boolean) => void
}

export function subscribeConversationRealtime(conversationId: string, callbacks: ConversationRealtimeCallbacks) {
  let closed = false
  let socket: WebSocket | null = null
  let joinRef: string | null = null
  let refCounter = 0
  let reconnectAttempts = 0
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let tokenTimer: ReturnType<typeof setInterval> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  const topicName = `conversation:${conversationId}`
  const protocolTopic = `realtime:${topicName}`
  const presence = new Map<string, unknown>()

  function nextRef() { refCounter += 1; return String(refCounter) }

  function sendFrame(event: string, payload: Record<string, unknown>, topic = protocolTopic, refJoin = joinRef) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify([refJoin, nextRef(), topic, event, payload]))
  }

  function publishPresence() {
    callbacks.onPresence?.([...presence.keys()])
  }

  async function connect() {
    if (closed) return
    try {
      const session = await getValidSession()
      if (closed) return
      const { url, key } = config()
      const wsBase = url.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')
      const wsUrl = new URL(`${wsBase}/realtime/v1/websocket`)
      wsUrl.searchParams.set('apikey', key)
      wsUrl.searchParams.set('vsn', '2.0.0')
      socket = new WebSocket(wsUrl.toString())

      socket.onopen = () => {
        if (closed || !socket) return
        reconnectAttempts = 0
        joinRef = nextRef()
        socket.send(JSON.stringify([joinRef, joinRef, protocolTopic, 'phx_join', {
          config: {
            broadcast: { ack: false, self: false },
            presence: { enabled: true, key: session.user.id },
            postgres_changes: [{ event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }],
            private: true,
          },
          access_token: session.access_token,
        }]))
      }

      socket.onmessage = event => {
        let frame: unknown
        try { frame = JSON.parse(String(event.data)) } catch { return }
        if (!Array.isArray(frame) || frame.length < 5) return
        const eventName = frame[3]
        const payload = frame[4] as Record<string, unknown> | undefined
        if (!payload) return
        if (eventName === 'phx_reply') {
          if (payload.status === 'ok') {
            callbacks.onStatus?.(true)
            sendFrame('presence', { type: 'presence', event: 'track', payload: { user_id: session.user.id, online_at: new Date().toISOString() } })
          } else if (payload.status === 'error') {
            callbacks.onStatus?.(false)
          }
        } else if (eventName === 'postgres_changes') {
          callbacks.onMessage?.()
        } else if (eventName === 'broadcast') {
          const eventType = payload.event
          const eventPayload = payload.payload as Record<string, unknown> | undefined
          if (eventType === 'typing' && eventPayload && typeof eventPayload.user_id === 'string') {
            callbacks.onTyping?.(eventPayload.user_id, eventPayload.typing === true)
          } else if (eventType === 'refresh') {
            callbacks.onMessage?.()
          }
        } else if (eventName === 'presence_state') {
          presence.clear()
          const state = payload as Record<string, unknown>
          for (const [key, value] of Object.entries(state)) presence.set(key, value)
          publishPresence()
        } else if (eventName === 'presence_diff') {
          const joins = payload.joins as Record<string, unknown> | undefined
          const leaves = payload.leaves as Record<string, unknown> | undefined
          if (joins) for (const [key, value] of Object.entries(joins)) presence.set(key, value)
          if (leaves) for (const key of Object.keys(leaves)) presence.delete(key)
          publishPresence()
        }
      }

      socket.onerror = () => { callbacks.onStatus?.(false); socket?.close() }
      socket.onclose = () => {
        callbacks.onStatus?.(false)
        if (closed) return
        const delay = Math.min(15000, 1000 * (2 ** Math.min(reconnectAttempts, 4)))
        reconnectAttempts += 1
        reconnectTimer = setTimeout(() => void connect(), delay)
      }

      if (!heartbeatTimer) heartbeatTimer = setInterval(() => sendFrame('heartbeat', {}, 'phoenix', null), 25000)
      if (!tokenTimer) tokenTimer = setInterval(async () => {
        try {
          const refreshed = await getValidSession()
          sendFrame('access_token', { access_token: refreshed.access_token })
        } catch {
          callbacks.onStatus?.(false)
        }
      }, 5 * 60 * 1000)
    } catch {
      callbacks.onStatus?.(false)
      if (closed) return
      const delay = Math.min(15000, 1000 * (2 ** Math.min(reconnectAttempts, 4)))
      reconnectAttempts += 1
      reconnectTimer = setTimeout(() => void connect(), delay)
    }
  }

  void connect()

  return {
    broadcast(event: string, payload: Record<string, unknown>) {
      sendFrame('broadcast', { type: 'broadcast', event, payload })
    },
    unsubscribe() {
      closed = true
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      if (tokenTimer) clearInterval(tokenTimer)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (socket?.readyState === WebSocket.OPEN) sendFrame('phx_leave', {})
      socket?.close()
      socket = null
      callbacks.onStatus?.(false)
    },
  }
}
