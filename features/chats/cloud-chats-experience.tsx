'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { ArrowLeft, MessageCircle, Plus, Search, Send, Users, RefreshCw, BookOpen, Paperclip, Mic, Square, Bell, BellOff, Pin, X, Camera, Sparkles } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/states'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { usePreferences } from '@/components/providers/preferences-provider'
import { cloudRest, cloudStorageRemove, cloudStorageSignedUrl, cloudStorageSignedUrls, cloudStorageUploadWithProgress, readCloudSession, subscribeCloudSession, subscribeConversationRealtime } from '@/lib/chats/cloud-client'
import { formatMediaDuration, validateChatMedia, validateStoryImage } from '@/lib/chats/validation'
import { cacheConversationMessages, enqueuePendingChatMessage, readCachedConversationMessages, readPendingChatMessages, readOfflineSnapshot, writeOfflineSnapshot, type PendingChatMessage } from '@/lib/chats/offline-store'

type Profile = { id: string; display_name: string; username: string | null; avatar_url: string | null; avatar_storage_path?: string | null; bio: string | null }
type Conversation = { id: string; kind: 'direct' | 'group'; title: string | null; avatar_url: string | null; last_message_at: string | null; created_at: string }
type Membership = { conversation_id: string; last_read_at: string | null; muted: boolean; pinned: boolean }
type Message = { id: string; conversation_id: string; sender_id: string; content: string; created_at: string; reply_to_message_id: string | null; deleted_for_everyone: boolean; edited_at: string | null; pinned_at: string | null; pending?: boolean; pending_attachment?: boolean; message_type?: 'text' | 'image' | 'file' | 'voice' }
type Story = { id: string; owner_id: string; story_type: 'text' | 'image'; text_content: string; storage_path: string | null; signed_url?: string; audience: 'community' | 'selected-members'; created_at: string; expires_at: string }
type CloudAttachment = { id: string; message_id: string; storage_path: string; file_name: string; mime_type: string; file_size: number; signed_url: string }
type CloudNotification = { id: string; actor_id: string | null; notification_type: string; payload: Record<string, unknown>; read_at: string | null; created_at: string }

function apiFilter(ids: string[]) {
  return `in.(${ids.map(id => `"${id}"`).join(',')})`
}

async function resolveAvatarProfiles(profiles: Profile[]): Promise<Profile[]> {
  const paths = [...new Set(profiles.map(profile => profile.avatar_url).filter((path): path is string => Boolean(path?.startsWith('avatars/'))))]
  if (!paths.length) return profiles
  let signed: Record<string, string> = {}
  try { signed = await cloudStorageSignedUrls(paths, 3600) } catch { /* keep initials if Storage is temporarily unavailable */ }
  return profiles.map(profile => profile.avatar_url?.startsWith('avatars/')
    ? { ...profile, avatar_storage_path: profile.avatar_url, avatar_url: signed[profile.avatar_url] ?? null }
    : profile)
}

function avatarExtension(mimeType: string) {
  const extension = mimeType.split('/')[1]?.toLowerCase() ?? 'png'
  return extension === 'jpeg' ? 'jpg' : extension
}

export function CloudChatsExperience() {
  const session = useSyncExternalStore(subscribeCloudSession, readCloudSession, () => null)
  const { t, locale } = usePreferences()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [members, setMembers] = useState<Profile[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [conversationPreferences, setConversationPreferences] = useState<Record<string, { pinned: boolean; muted: boolean }>>({})
  const [conversationPreviews, setConversationPreviews] = useState<Record<string, string>>({})
  const [messageReceiptStatus, setMessageReceiptStatus] = useState<Record<string, 'sent' | 'delivered' | 'read'>>({})
  const [peerNames, setPeerNames] = useState<Record<string, string>>({})
  const [peerAvatars, setPeerAvatars] = useState<Record<string, string>>({})
  const [messageReactions, setMessageReactions] = useState<Record<string, string[]>>({})
  const [replyToMessageId, setReplyToMessageId] = useState<string | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [forwardingMessageId, setForwardingMessageId] = useState<string | null>(null)
  const [forwardTargetId, setForwardTargetId] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [messageAttachments, setMessageAttachments] = useState<Record<string, CloudAttachment[]>>({})
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null)
  const [voiceDurationMs, setVoiceDurationMs] = useState(0)
  const [recording, setRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [uploadKind, setUploadKind] = useState<'message' | 'story' | 'avatar' | 'group' | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const cancelRecordingRef = useRef(false)
  const recordingStartedAtRef = useRef(0)
  const recordingTimerRef = useRef<number | null>(null)
  const uploadAbortRef = useRef<AbortController | null>(null)
  const voicePreviewRef = useRef<HTMLAudioElement | null>(null)
  const [stories, setStories] = useState<Story[]>([])
  const [seenStoryIds, setSeenStoryIds] = useState<string[]>([])
  const [activeStory, setActiveStory] = useState<Story | null>(null)
  const [storyViewers, setStoryViewers] = useState<Array<{ id: string; display_name: string; viewed_at: string }>>([])
  const [notifications, setNotifications] = useState<CloudNotification[]>([])
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const [typingUserId, setTypingUserId] = useState<string | null>(null)
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([])
  const realtimeRef = useRef<ReturnType<typeof subscribeConversationRealtime> | null>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [activeId, setActiveId] = useState('')
  const [messageSearchOpen, setMessageSearchOpen] = useState(false)
  const [messageSearchQuery, setMessageSearchQuery] = useState('')
  const [messageSearchResults, setMessageSearchResults] = useState<Message[]>([])
  const [messageSearchBusy, setMessageSearchBusy] = useState(false)
  const [jumpToMessageId, setJumpToMessageId] = useState<string | null>(null)
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false)
  const [directoryOpen, setDirectoryOpen] = useState(true)
  const [memberSearch, setMemberSearch] = useState('')
  const [messageText, setMessageText] = useState('')
  const [storyText, setStoryText] = useState('')
  const [storyImage, setStoryImage] = useState<File | null>(null)
  const [storyAudience, setStoryAudience] = useState<'community' | 'selected-members'>('community')
  const [storyAudienceMemberIds, setStoryAudienceMemberIds] = useState<string[]>([])
  const [storyComposer, setStoryComposer] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileUsername, setProfileUsername] = useState('')
  const [profileBio, setProfileBio] = useState('')
  const [profileAvatarFile, setProfileAvatarFile] = useState<File | null>(null)
  const [groupComposerOpen, setGroupComposerOpen] = useState(false)
  const [manageGroupOpen, setManageGroupOpen] = useState(false)
  const [groupAddMemberIds, setGroupAddMemberIds] = useState<string[]>([])
  const [conversationMembers, setConversationMembers] = useState<Record<string, Array<{ user_id: string; role: string }>>>({})
  const [groupTitle, setGroupTitle] = useState('')
  const [groupImageFile, setGroupImageFile] = useState<File | null>(null)
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([])



  useEffect(() => () => {
    uploadAbortRef.current?.abort()
    if (recorderRef.current?.state === 'recording') {
      cancelRecordingRef.current = true
      chunksRef.current = []
      recorderRef.current.stop()
    }
    streamRef.current?.getTracks().forEach(track => track.stop())
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current)
  }, [])

  useEffect(() => {
    const audio = voicePreviewRef.current
    if (!audio || !voiceBlob) return
    const url = URL.createObjectURL(voiceBlob)
    audio.src = url
    return () => {
      audio.pause()
      audio.removeAttribute('src')
      URL.revokeObjectURL(url)
    }
  }, [voiceBlob])

  const loadData = useCallback(async () => {
    if (!session) return
    setError('')
    setDataLoading(true)
    try {
      const [cachedPeople, cachedConversations, cachedStories, cachedNotifications] = await Promise.all([
        readOfflineSnapshot<{ profile: Profile | null; members: Profile[] }>(`chat:people:${session.user.id}`).catch(() => null),
        readOfflineSnapshot<{ conversations: Conversation[]; unreadCounts: Record<string, number>; preferences: Record<string, { pinned: boolean; muted: boolean }>; previews: Record<string, string>; peerNames: Record<string, string>; peerAvatars: Record<string, string>; conversationMembers: Record<string, Array<{ user_id: string; role: string }>> }>(`chat:conversations:${session.user.id}`).catch(() => null),
        readOfflineSnapshot<Story[]>(`chat:stories:${session.user.id}`).catch(() => null),
        readOfflineSnapshot<CloudNotification[]>(`chat:notifications:${session.user.id}`).catch(() => null),
      ])
      if (cachedPeople) { setProfile(cachedPeople.profile); setMembers(cachedPeople.members) }
      if (cachedConversations) { setConversations(cachedConversations.conversations); setUnreadCounts(cachedConversations.unreadCounts); setConversationPreferences(cachedConversations.preferences); setConversationPreviews(cachedConversations.previews); setPeerNames(cachedConversations.peerNames); setPeerAvatars(cachedConversations.peerAvatars); setConversationMembers(cachedConversations.conversationMembers); setActiveId(current => current || cachedConversations.conversations[0]?.id || '') }
      if (cachedStories) setStories(cachedStories)
      if (cachedNotifications) setNotifications(cachedNotifications)
      if (!navigator.onLine) return
      const meRows = await cloudRest<Profile[]>(`profiles?select=id,display_name,username,avatar_url,bio&id=eq.${session.user.id}&limit=1`)
      const me = (await resolveAvatarProfiles(meRows))[0] ?? null
      setProfile(me)
      if (me) { setProfileName(me.display_name ?? ''); setProfileUsername(me.username ?? ''); setProfileBio(me.bio ?? '') }
      const directoryRows = await cloudRest<Profile[]>('profiles?select=id,display_name,username,avatar_url,bio&order=display_name.asc&limit=100')
      const directory = await resolveAvatarProfiles(directoryRows)
      const otherMembers = directory.filter(item => item.id !== session.user.id)
      setMembers(otherMembers)
      void writeOfflineSnapshot(`chat:people:${session.user.id}`, { profile: me, members: otherMembers }).catch(() => {})
      const memberRows = await cloudRest<Membership[]>(`conversation_members?select=conversation_id,last_read_at,muted,pinned&user_id=eq.${session.user.id}`)
      setConversationPreferences(Object.fromEntries(memberRows.map(row => [row.conversation_id, { pinned: row.pinned, muted: row.muted }])))
      if (memberRows.length) {
        const ids = memberRows.map(row => row.conversation_id)
        const convRows = await cloudRest<Conversation[]>(`conversations?select=id,kind,title,avatar_url,last_message_at,created_at&id=${apiFilter(ids)}&order=last_message_at.desc.nullslast`)
        const groupAvatarPaths = convRows.map(conversation => conversation.avatar_url).filter((path): path is string => Boolean(path?.startsWith('avatars/')))
        let signedConversationAvatars: Record<string, string> = {}
        try { signedConversationAvatars = await cloudStorageSignedUrls(groupAvatarPaths, 3600) } catch { /* fall back to member initials */ }
        const convs = convRows.map(conversation => conversation.avatar_url?.startsWith('avatars/')
          ? { ...conversation, avatar_url: signedConversationAvatars[conversation.avatar_url] ?? null }
          : conversation)
        const unreadPairs = await Promise.all(memberRows.map(async row => {
          const since = row.last_read_at ?? '1970-01-01T00:00:00.000Z'
          const unread = await cloudRest<{ id: string }[]>(`messages?select=id&conversation_id=eq.${row.conversation_id}&sender_id=neq.${session.user.id}&created_at=gt.${encodeURIComponent(since)}&deleted_for_everyone=eq.false&limit=100`)
          return [row.conversation_id, unread.length] as const
        }))
        setUnreadCounts(Object.fromEntries(unreadPairs))
        const recentMessages = await cloudRest<{ conversation_id: string; content: string; created_at: string }[]>(`messages?select=conversation_id,content,created_at&conversation_id=${apiFilter(ids)}&order=created_at.desc&limit=100`)
        const previews: Record<string, string> = {}
        for (const row of recentMessages) if (!(row.conversation_id in previews)) previews[row.conversation_id] = row.content
        setConversationPreviews(previews)
        const sortedConversations = [...convs].sort((a, b) => {
          const aPinned = memberRows.find(row => row.conversation_id === a.id)?.pinned ? 1 : 0
          const bPinned = memberRows.find(row => row.conversation_id === b.id)?.pinned ? 1 : 0
          return bPinned - aPinned || Date.parse(b.last_message_at ?? b.created_at) - Date.parse(a.last_message_at ?? a.created_at)
        })
        setConversations(sortedConversations)
        const allMembers = await cloudRest<{ conversation_id: string; user_id: string; role: string }[]>(`conversation_members?select=conversation_id,user_id,role&conversation_id=${apiFilter(ids)}`)
        const memberMap: Record<string, Array<{ user_id: string; role: string }>> = {}
        for (const row of allMembers) memberMap[row.conversation_id] = [...(memberMap[row.conversation_id] ?? []), { user_id: row.user_id, role: row.role }]
        setConversationMembers(memberMap)
        const peerIds = [...new Set(allMembers.map(row => row.user_id).filter(id => id !== session.user.id))]
        const names: Record<string, string> = {}
        const avatars: Record<string, string> = {}
        if (peerIds.length) {
          const profilesById = new Map([...directory, ...(me ? [me] : [])].map(item => [item.id, item]))
          for (const row of allMembers) {
            const peer = profilesById.get(row.user_id)
            if (peer) {
              names[row.conversation_id] = names[row.conversation_id] ? `${names[row.conversation_id]}, ${peer.display_name}` : peer.display_name
              if (peer.avatar_url && convs.find(conversation => conversation.id === row.conversation_id)?.kind !== 'group') avatars[row.conversation_id] = peer.avatar_url
            }
          }
          setPeerNames(names)
          setPeerAvatars(avatars)
        } else { setPeerNames({}); setPeerAvatars({}) }
        void writeOfflineSnapshot(`chat:conversations:${session.user.id}`, { conversations: sortedConversations, unreadCounts: Object.fromEntries(unreadPairs), preferences: Object.fromEntries(memberRows.map(row => [row.conversation_id, { pinned: row.pinned, muted: row.muted }])), previews, peerNames: names, peerAvatars: avatars, conversationMembers: memberMap }).catch(() => {})
        const firstConversation = convs[0]
        if (firstConversation) setActiveId(current => current || firstConversation.id)
      } else { setConversations([]); setUnreadCounts({}); setConversationPreviews({}); setPeerNames({}); setPeerAvatars({}); setConversationMembers({}); setConversationPreferences({}); void writeOfflineSnapshot(`chat:conversations:${session.user.id}`, { conversations: [], unreadCounts: {}, preferences: {}, previews: {}, peerNames: {}, peerAvatars: {}, conversationMembers: {} }).catch(() => {}) }
      const now = new Date().toISOString()
      const storyRows = await cloudRest<Story[]>(`stories?select=id,owner_id,story_type,text_content,storage_path,audience,created_at,expires_at&status=eq.published&expires_at=gt.${encodeURIComponent(now)}&order=created_at.desc&limit=50`)
      const storiesWithUrls = await Promise.all(storyRows.map(async story => story.storage_path ? { ...story, signed_url: await cloudStorageSignedUrl(story.storage_path, 3600) } : story))
      setStories(storiesWithUrls)
      void writeOfflineSnapshot(`chat:stories:${session.user.id}`, storiesWithUrls).catch(() => {})
      if (storyRows.length) {
        const ownStoryIds = storyRows.filter(story => story.owner_id === session.user.id).map(story => story.id)
        try {
          const seenRows = await cloudRest<{ story_id: string }[]>(`story_views?select=story_id&viewer_id=eq.${session.user.id}&story_id=${apiFilter(storyRows.map(story => story.id))}`)
          setSeenStoryIds([...ownStoryIds, ...seenRows.map(row => row.story_id)])
        } catch {
          setSeenStoryIds(ownStoryIds)
        }
      } else setSeenStoryIds([])
      const notificationRows = await cloudRest<CloudNotification[]>(`in_app_notifications?select=id,actor_id,notification_type,payload,read_at,created_at&recipient_id=eq.${session.user.id}&order=created_at.desc&limit=30`)
      setNotifications(notificationRows)
      void writeOfflineSnapshot(`chat:notifications:${session.user.id}`, notificationRows).catch(() => {})
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('cloud.error.loadChats'))
    } finally {
      setDataLoading(false)
    }
  }, [session, t])

  // Async data loading is the external-system synchronization this effect exists for.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadData() }, [loadData])

  const loadMessages = useCallback(async () => {
    if (!activeId || !session) { setMessages([]); setMessageAttachments({}); return }
    try {
      const cachedRows = await readCachedConversationMessages<Message>(activeId).catch(() => [])
      const queuedRows = await readPendingChatMessages(activeId).catch(() => [])
      const queuedMessages: Message[] = queuedRows.map(item => ({ id: item.id, conversation_id: item.conversation_id, sender_id: item.sender_id, content: item.content, created_at: item.created_at, reply_to_message_id: item.reply_to_message_id, deleted_for_everyone: false, edited_at: null, pinned_at: null, pending: true, pending_attachment: Boolean(item.attachment), message_type: item.attachment ? (item.attachment.mime_type.startsWith('image/') ? 'image' : item.attachment.mime_type.startsWith('audio/') ? 'voice' : 'file') : 'text' }))
      if (cachedRows.length || queuedMessages.length) setMessages([...cachedRows, ...queuedMessages].sort((a, b) => a.created_at.localeCompare(b.created_at)))
      if (!navigator.onLine) { setMessageAttachments({}); return }
      const rows = await cloudRest<Message[]>(`messages?select=id,conversation_id,sender_id,content,created_at,reply_to_message_id,deleted_for_everyone,edited_at,pinned_at&conversation_id=eq.${activeId}&order=created_at.asc&limit=500`)
      void cacheConversationMessages(rows).catch(() => {})
      const serverIds = new Set(rows.map(row => row.id))
      setMessages([...rows, ...queuedMessages.filter(item => !serverIds.has(item.id))].sort((a, b) => a.created_at.localeCompare(b.created_at)))
      if (rows.length) {
        const latestMessage = rows.at(-1)
        if (latestMessage) {
          let shouldBroadcastRead = false
          if (latestMessage.sender_id !== session.user.id) {
            const existingRead = await cloudRest<{ read_at: string | null }[]>(`message_receipts?select=read_at&message_id=eq.${latestMessage.id}&user_id=eq.${session.user.id}`)
            shouldBroadcastRead = !existingRead[0]?.read_at
          }
          await cloudRest<void>('rpc/mark_message_read', { method: 'POST', body: JSON.stringify({ p_message_id: latestMessage.id }) })
          if (shouldBroadcastRead) realtimeRef.current?.broadcast('refresh', { kind: 'read_receipt', message_id: latestMessage.id })
        }
        const reactionRows = await cloudRest<{ message_id: string; user_id: string; emoji: string }[]>(`message_reactions?select=message_id,user_id,emoji&message_id=${apiFilter(rows.map(row => row.id))}`)
        const grouped: Record<string, string[]> = {}
        for (const reaction of reactionRows) grouped[reaction.message_id] = [...(grouped[reaction.message_id] ?? []), reaction.emoji]
        setMessageReactions(grouped)
        const attachments = await cloudRest<Omit<CloudAttachment, 'signed_url'>[]>(`message_attachments?select=id,message_id,storage_path,file_name,mime_type,file_size&message_id=${apiFilter(rows.map(row => row.id))}`)
        const signed = await Promise.all(attachments.map(async item => ({ ...item, signed_url: await cloudStorageSignedUrl(item.storage_path) })))
        const byMessage: Record<string, CloudAttachment[]> = {}
        for (const item of signed) byMessage[item.message_id] = [...(byMessage[item.message_id] ?? []), item]
        setMessageAttachments(byMessage)
        const ownMessageIds = rows.filter(row => row.sender_id === session.user.id).map(row => row.id)
        const receiptStatus: Record<string, 'sent' | 'delivered' | 'read'> = {}
        if (ownMessageIds.length) {
          const receipts = await cloudRest<{ message_id: string; delivered_at: string | null; read_at: string | null }[]>(`message_receipts?select=message_id,delivered_at,read_at&message_id=${apiFilter(ownMessageIds)}&user_id=neq.${session.user.id}`)
          for (const row of receipts) {
            const current = receiptStatus[row.message_id] ?? 'sent'
            receiptStatus[row.message_id] = row.read_at ? 'read' : row.delivered_at && current !== 'read' ? 'delivered' : current
          }
        }
        setMessageReceiptStatus(receiptStatus)
      } else {
        setMessageReactions({})
        setMessageAttachments({})
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('cloud.error.loadMessages'))
    }
  }, [activeId, session, t])

  // Fetch messages when the selected conversation changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadMessages() }, [loadMessages])

  useEffect(() => {
    const refreshChats = () => { void loadData(); void loadMessages() }
    window.addEventListener('online', refreshChats)
    window.addEventListener('study:offline-outbox-synced', refreshChats)
    return () => {
      window.removeEventListener('online', refreshChats)
      window.removeEventListener('study:offline-outbox-synced', refreshChats)
    }
  }, [loadData, loadMessages])

  useEffect(() => {
    if (!jumpToMessageId) return
    const scrollTimer = window.setTimeout(() => {
      document.getElementById(`cloud-message-${jumpToMessageId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 0)
    const clearTimer = window.setTimeout(() => setJumpToMessageId(null), 1600)
    return () => { window.clearTimeout(scrollTimer); window.clearTimeout(clearTimer) }
  }, [messages, jumpToMessageId])
  useEffect(() => {
    if (!session) return
    const timer = window.setInterval(() => { void loadData(); void loadMessages() }, 30000)
    return () => window.clearInterval(timer)
  }, [session, loadData, loadMessages])

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLocaleLowerCase()
    if (!q) return members
    return members.filter(item => `${item.display_name} ${item.username ?? ''} ${item.bio ?? ''}`.toLocaleLowerCase().includes(q))
  }, [members, memberSearch])

  async function toggleConversationPreference(preference: 'pinned' | 'muted') {
    if (!activeId || !session) return
    const current = conversationPreferences[activeId] ?? { pinned: false, muted: false }
    const value = !current[preference]
    try {
      await cloudRest<void>(`conversation_members?conversation_id=eq.${activeId}&user_id=eq.${session.user.id}`, { method: 'PATCH', body: JSON.stringify({ [preference]: value }) })
      setConversationPreferences(currentPrefs => ({ ...currentPrefs, [activeId]: { ...current, [preference]: value } }))
      await loadData()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('cloud.error.loadChats'))
    }
  }

  async function startDirect(member: Profile) {
    setBusy(true); setError(''); setStatus('')
    try {
      const id = await cloudRest<string>('rpc/start_direct_conversation', { method: 'POST', body: JSON.stringify({ p_other_user: member.id }) })
      setActiveId(id)
      setMobileThreadOpen(true)
      await loadData()
      setStatus(t('cloud.status.conversationOpened'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('cloud.error.startConversation'))
    } finally { setBusy(false) }
  }

  async function openNotification(notification: CloudNotification) {
    try {
      if (!notification.read_at) {
        await cloudRest<void>(`in_app_notifications?id=eq.${notification.id}`, { method: 'PATCH', body: JSON.stringify({ read_at: new Date().toISOString() }) })
        setNotifications(current => current.map(item => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item))
      }
      const conversationId = notification.payload.conversation_id
      const storyId = notification.payload.story_id
      if (typeof conversationId === 'string') { setActiveId(conversationId); setMobileThreadOpen(true) }
      if (typeof storyId === 'string') {
        const story = stories.find(item => item.id === storyId)
        if (story) await openStory(story)
        else setStatus(t('cloud.notifications.storyExpired'))
      }
      setNotificationsOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('cloud.error.openNotification'))
    }
  }

  function notificationLabel(notification: CloudNotification) {
    if (notification.notification_type === 'private_message') return t('cloud.notifications.privateMessage')
    if (notification.notification_type === 'group_message') return t('cloud.notifications.groupMessage')
    if (notification.notification_type === 'group_member_added') return t('cloud.notifications.groupMemberAdded')
    return t('cloud.notifications.storyReaction')
  }

  async function startVoiceRecording() {
    setError('')
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error(t('cloud.messages.voiceUnsupported'))
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      chunksRef.current = []
      setSelectedFile(null)
      setVoiceBlob(null)
      setVoiceDurationMs(0)
      cancelRecordingRef.current = false
      recordingStartedAtRef.current = Date.now()
      setRecordingSeconds(0)
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data) }
      recorder.onstop = () => {
        const cancelled = cancelRecordingRef.current
        cancelRecordingRef.current = false
        if (recordingTimerRef.current) {
          window.clearInterval(recordingTimerRef.current)
          recordingTimerRef.current = null
        }
        if (!cancelled) {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
          const duration = Date.now() - recordingStartedAtRef.current
          if (!blob.size || duration < 500) {
            setVoiceBlob(null)
            setVoiceDurationMs(0)
            setError(t('cloud.messages.voiceTooShort'))
          } else {
            setVoiceBlob(blob)
            setVoiceDurationMs(duration)
            setSelectedFile(null)
          }
        } else {
          setVoiceBlob(null)
          setVoiceDurationMs(0)
        }
        setRecording(false)
        stream.getTracks().forEach(track => track.stop())
        streamRef.current = null
        recorderRef.current = null
      }
      recorder.start()
      recordingTimerRef.current = window.setInterval(() => setRecordingSeconds(Math.floor((Date.now() - recordingStartedAtRef.current) / 1000)), 1000)
      setRecording(true)
    } catch (cause) {
      streamRef.current?.getTracks().forEach(track => track.stop())
      streamRef.current = null
      recorderRef.current = null
      if (recordingTimerRef.current) { window.clearInterval(recordingTimerRef.current); recordingTimerRef.current = null }
      setRecording(false)
      setError(cause instanceof Error ? cause.message : t('cloud.error.startVoice'))
    }
  }

  function stopVoiceRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  function cancelVoiceRecording() {
    if (recorderRef.current?.state === 'recording') {
      cancelRecordingRef.current = true
      chunksRef.current = []
      recorderRef.current.stop()
    }
  }

  function cancelUpload() {
    uploadAbortRef.current?.abort()
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeId || !session || (!messageText.trim() && !selectedFile && !voiceBlob)) return
    const media = voiceBlob ?? selectedFile
    if (media) {
      const validation = validateChatMedia(media, Boolean(voiceBlob))
      if (validation) { setError(t(validation === 'fileTypeInvalid' ? 'cloud.messages.fileTypeInvalid' : 'cloud.messages.fileTooLarge')); return }
    }
    setBusy(true); setError('')
    let uploadedPath: string | null = null
    const messageId = crypto.randomUUID()
    const voiceExtension = voiceBlob?.type.includes('mp4') ? 'm4a' : voiceBlob?.type.includes('ogg') ? 'ogg' : 'webm'
    const mediaName = voiceBlob ? `voice-note-${Date.now()}.${voiceExtension}` : selectedFile?.name ?? ''
    const mediaType = voiceBlob ? 'voice' : selectedFile?.type.startsWith('image/') ? 'image' : 'file'
    try {
      if (!navigator.onLine) {
        const pending: PendingChatMessage = { id: messageId, conversation_id: activeId, sender_id: session.user.id, content: messageText.trim(), created_at: new Date().toISOString(), reply_to_message_id: replyToMessageId, attachment: media ? { blob: media, file_name: mediaName, mime_type: media.type || 'application/octet-stream', file_size: media.size, duration_ms: voiceBlob ? voiceDurationMs : null } : undefined }
        await enqueuePendingChatMessage(pending)
        setMessages(current => [...current.filter(item => item.id !== messageId), { id: messageId, conversation_id: activeId, sender_id: session.user.id, content: messageText.trim(), created_at: pending.created_at, reply_to_message_id: replyToMessageId, deleted_for_everyone: false, edited_at: null, pinned_at: null, pending: true, pending_attachment: Boolean(media), message_type: media ? mediaType : 'text' }])
        setMessageText(''); setReplyToMessageId(null); setSelectedFile(null); setVoiceBlob(null); setVoiceDurationMs(0)
        setStatus(locale === 'ar' ? 'اتحفظت الرسالة على الجهاز وهتتبعت أول ما الإنترنت يرجع.' : 'Message saved on this device and will send when you reconnect.')
        return
      }
      await cloudRest<{ id: string }[]>('messages?select=id', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ id: messageId, conversation_id: activeId, sender_id: session.user.id, content: messageText.trim(), message_type: media ? mediaType : 'text', reply_to_message_id: replyToMessageId }),
      })
      if (!messageId) throw new Error('The database did not return the new message id')
      if (media) {
        const safeName = mediaName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'attachment'
        uploadedPath = `conversations/${activeId}/${session.user.id}/${messageId}-${safeName}`
        const controller = new AbortController()
        uploadAbortRef.current = controller
        setUploadKind('message')
        setUploadProgress(0)
        await cloudStorageUploadWithProgress(uploadedPath, media, progress => setUploadProgress(progress), controller.signal)
        uploadAbortRef.current = null
        setUploadProgress(null)
        setUploadKind(null)
        await cloudRest<void>('message_attachments', {
          method: 'POST',
          body: JSON.stringify({ message_id: messageId, conversation_id: activeId, storage_path: uploadedPath, file_name: mediaName, mime_type: media.type || 'application/octet-stream', file_size: media.size, duration_ms: voiceBlob ? voiceDurationMs : null }),
        })
      }
      setMessageText(''); setReplyToMessageId(null); setSelectedFile(null); setVoiceBlob(null); setVoiceDurationMs(0)
      realtimeRef.current?.broadcast('typing', { user_id: session.user.id, typing: false })
      await loadMessages()
      await loadData()
    } catch (cause) {
      const causeMessage = cause instanceof Error ? cause.message.toLowerCase() : ''
      const networkFailure = !navigator.onLine || cause instanceof TypeError || /network|fetch failed|connection|offline|timed out/.test(causeMessage)
      if (networkFailure) {
        const pending: PendingChatMessage = { id: messageId, conversation_id: activeId, sender_id: session.user.id, content: messageText.trim(), created_at: new Date().toISOString(), reply_to_message_id: replyToMessageId, attachment: media ? { blob: media, file_name: mediaName, mime_type: media.type || 'application/octet-stream', file_size: media.size, duration_ms: voiceBlob ? voiceDurationMs : null } : undefined }
        try {
          await enqueuePendingChatMessage(pending)
          setMessages(current => [...current.filter(item => item.id !== messageId), { id: messageId, conversation_id: activeId, sender_id: session.user.id, content: messageText.trim(), created_at: pending.created_at, reply_to_message_id: replyToMessageId, deleted_for_everyone: false, edited_at: null, pinned_at: null, pending: true, pending_attachment: Boolean(media), message_type: media ? mediaType : 'text' }])
          setMessageText(''); setReplyToMessageId(null); setSelectedFile(null); setVoiceBlob(null); setVoiceDurationMs(0)
          setStatus(locale === 'ar' ? 'اتحفظت الرسالة على الجهاز وهتتبعت أول ما الإنترنت يرجع.' : 'Message saved on this device and will send when you reconnect.')
          return
        } catch { setError(locale === 'ar' ? 'فشل حفظ الرسالة محليًا. سيب الشاشة مفتوحة وحاول تاني.' : 'Could not save this message offline. Keep this screen open and retry.') }
      }
      if (uploadedPath) await cloudStorageRemove(uploadedPath).catch(() => {})
      await cloudRest<void>(`messages?id=eq.${messageId}`, { method: 'DELETE' }).catch(() => {})
      setError(cause instanceof Error && cause.name === 'AbortError' ? t('cloud.messages.uploadCancelled') : cause instanceof Error ? cause.message : t('cloud.error.sendMessage'))
    } finally { uploadAbortRef.current = null; setUploadProgress(null); setUploadKind(null); setBusy(false) }
  }

  async function editMessage(messageId: string) {
    if (!editingText.trim()) return
    try {
      await cloudRest<void>('rpc/edit_message', { method: 'POST', body: JSON.stringify({ p_message_id: messageId, p_content: editingText.trim() }) })
      setEditingMessageId(null); setEditingText('')
      await loadMessages()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('cloud.error.editMessage'))
    }
  }

  async function deleteMessage(messageId: string) {
    try {
      await cloudRest<void>('rpc/delete_message_for_everyone', { method: 'POST', body: JSON.stringify({ p_message_id: messageId }) })
      await loadMessages()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('cloud.error.deleteMessage'))
    }
  }

  async function pinMessage(messageId: string, pinned: boolean) {
    try {
      await cloudRest<void>('rpc/pin_message', { method: 'POST', body: JSON.stringify({ p_message_id: messageId, p_pinned: pinned }) })
      await loadMessages()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('cloud.error.pinMessage'))
    }
  }

  async function forwardMessage(message: Message) {
    if (!session || !forwardTargetId) return
    try {
      await cloudRest<void>('messages', { method: 'POST', body: JSON.stringify({ conversation_id: forwardTargetId, sender_id: session.user.id, content: message.content, message_type: 'text', forwarded_from_message_id: message.id }) })
      setForwardingMessageId(null); setForwardTargetId('')
      setStatus(t('cloud.messages.forwardSuccess'))
      await loadData()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('cloud.error.forwardMessage'))
    }
  }

  async function toggleMessageReaction(messageId: string, emoji: string) {
    if (!session) return
    setError('')
    try {
      const existing = await cloudRest<{ emoji: string }[]>(`message_reactions?select=emoji&message_id=eq.${messageId}&user_id=eq.${session.user.id}&emoji=eq.${encodeURIComponent(emoji)}`)
      if (existing.length) {
        await cloudRest<void>(`message_reactions?message_id=eq.${messageId}&user_id=eq.${session.user.id}&emoji=eq.${encodeURIComponent(emoji)}`, { method: 'DELETE' })
      } else {
        await cloudRest<void>('message_reactions', { method: 'POST', body: JSON.stringify({ message_id: messageId, user_id: session.user.id, emoji }) })
      }
      await loadMessages()
      realtimeRef.current?.broadcast('refresh', { kind: 'message_reaction', message_id: messageId })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('cloud.error.reaction'))
    }
  }

  useEffect(() => {
    if (!activeId || !session) return
    const channel = subscribeConversationRealtime(activeId, {
      onMessage: () => { void loadMessages(); void loadData() },
      onStatus: connected => setRealtimeConnected(connected),
      onPresence: userIds => setOnlineUserIds(userIds.filter(id => id !== session.user.id)),
      onTyping: (userId, typing) => {
        if (userId === session.user.id) return
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
        setTypingUserId(typing ? userId : null)
        if (typing) typingTimerRef.current = setTimeout(() => setTypingUserId(null), 3500)
      },
    })
    realtimeRef.current = channel
    return () => {
      channel.unsubscribe()
      if (realtimeRef.current === channel) realtimeRef.current = null
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    }
  }, [activeId, session, loadMessages, loadData])

  async function addGroupMembers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeId || !groupAddMemberIds.length) return
    setBusy(true); setError('')
    try {
      await cloudRest<void>('rpc/add_conversation_members', { method: 'POST', body: JSON.stringify({ p_conversation_id: activeId, p_member_ids: groupAddMemberIds }) })
      setGroupAddMemberIds([]); setManageGroupOpen(false)
      await loadData()
      setStatus(t('cloud.group.membersAdded'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('cloud.error.addGroupMembers'))
    } finally { setBusy(false) }
  }

  async function removeGroupMember(memberId: string) {
    if (!activeId) return
    setBusy(true); setError('')
    try {
      await cloudRest<void>('rpc/remove_conversation_member', { method: 'POST', body: JSON.stringify({ p_conversation_id: activeId, p_member_id: memberId }) })
      if (memberId === session?.user.id) { setActiveId(''); setManageGroupOpen(false) }
      await loadData()
      setStatus(t('cloud.group.memberRemoved'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('cloud.error.removeGroupMember'))
    } finally { setBusy(false) }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session) return
    if (profileAvatarFile) {
      const validation = validateStoryImage(profileAvatarFile)
      if (validation) { setError(t(validation === 'imageTypeInvalid' ? 'cloud.stories.imageTypeInvalid' : 'cloud.error.storyImageSize')); return }
    }
    setBusy(true); setError(''); setStatus('')
    let uploadedAvatarPath: string | null = null
    let profileUpdated = false
    const oldAvatarPath = profile?.avatar_storage_path ?? null
    try {
      let avatarUrl = profile?.avatar_storage_path ?? profile?.avatar_url ?? null
      if (profileAvatarFile) {
        uploadedAvatarPath = `avatars/${session.user.id}/profile/${crypto.randomUUID()}.${avatarExtension(profileAvatarFile.type)}`
        const controller = new AbortController()
        uploadAbortRef.current = controller
        setUploadKind('avatar')
        setUploadProgress(0)
        await cloudStorageUploadWithProgress(uploadedAvatarPath, profileAvatarFile, progress => setUploadProgress(progress), controller.signal)
        uploadAbortRef.current = null
        setUploadProgress(null)
        setUploadKind(null)
        avatarUrl = uploadedAvatarPath
      }
      await cloudRest<Profile[]>(`profiles?id=eq.${session.user.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ display_name: profileName.trim(), username: profileUsername.trim() || null, bio: profileBio.trim() || null, avatar_url: avatarUrl }),
      })
      profileUpdated = true
      if (oldAvatarPath && uploadedAvatarPath && oldAvatarPath !== uploadedAvatarPath) void cloudStorageRemove(oldAvatarPath).catch(() => {})
      setProfileAvatarFile(null)
      setProfileOpen(false)
      await loadData()
      setStatus(t('cloud.profile.saved'))
    } catch (cause) {
      if (uploadedAvatarPath && !profileUpdated) void cloudStorageRemove(uploadedAvatarPath).catch(() => {})
      setError(cause instanceof Error && cause.name === 'AbortError' ? t('cloud.messages.uploadCancelled') : cause instanceof Error ? cause.message : t('cloud.error.saveProfile'))
    } finally { uploadAbortRef.current = null; setUploadProgress(null); setUploadKind(null); setBusy(false) }
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session || !groupTitle.trim() || !selectedGroupMembers.length) return
    if (groupImageFile) {
      const validation = validateStoryImage(groupImageFile)
      if (validation) { setError(t(validation === 'imageTypeInvalid' ? 'cloud.stories.imageTypeInvalid' : 'cloud.error.storyImageSize')); return }
    }
    setBusy(true); setError(''); setStatus('')
    let groupAvatarPath: string | null = null
    let createdGroupId: string | null = null
    try {
      if (groupImageFile) {
        groupAvatarPath = `avatars/${session.user.id}/groups/${crypto.randomUUID()}.${avatarExtension(groupImageFile.type)}`
        const controller = new AbortController()
        uploadAbortRef.current = controller
        setUploadKind('group')
        setUploadProgress(0)
        await cloudStorageUploadWithProgress(groupAvatarPath, groupImageFile, progress => setUploadProgress(progress), controller.signal)
        uploadAbortRef.current = null
        setUploadProgress(null)
        setUploadKind(null)
      }
      const id = await cloudRest<string>('rpc/create_group_conversation', {
        method: 'POST',
        body: JSON.stringify({ p_title: groupTitle.trim(), p_member_ids: selectedGroupMembers }),
      })
      createdGroupId = id
      if (groupAvatarPath) {
        await cloudRest<void>(`conversations?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ avatar_url: groupAvatarPath }) })
      }
      setGroupTitle(''); setSelectedGroupMembers([]); setGroupImageFile(null); setGroupComposerOpen(false); setActiveId(id); setMobileThreadOpen(true)
      await loadData()
      setStatus(t('cloud.members.groupCreated'))
    } catch (cause) {
      if (groupAvatarPath) void cloudStorageRemove(groupAvatarPath).catch(() => {})
      if (createdGroupId && groupImageFile) {
        setGroupTitle(''); setSelectedGroupMembers([]); setGroupImageFile(null); setGroupComposerOpen(false); setActiveId(createdGroupId)
        await loadData().catch(() => {})
        setError(t('cloud.error.groupAvatarUpload'))
      } else {
        setError(cause instanceof Error && cause.name === 'AbortError' ? t('cloud.messages.uploadCancelled') : cause instanceof Error ? cause.message : t('cloud.error.createGroup'))
      }
    } finally { uploadAbortRef.current = null; setUploadProgress(null); setUploadKind(null); setBusy(false) }
  }

  async function markStorySeen(storyId: string) {
    try {
      await cloudRest<void>('rpc/mark_story_view', { method: 'POST', body: JSON.stringify({ p_story_id: storyId }) })
      setSeenStoryIds(current => current.includes(storyId) ? current : [...current, storyId])
      setStatus(t('cloud.stories.viewRecorded'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('cloud.error.storyView'))
    }
  }

  async function openStory(story: Story) {
    setActiveStory(story)
    setStoryViewers([])
    if (story.owner_id !== session?.user.id) { void markStorySeen(story.id); return }
    try {
      const views = await cloudRest<{ viewer_id: string; viewed_at: string }[]>(`story_views?select=viewer_id,viewed_at&story_id=eq.${story.id}&order=viewed_at.desc`)
      const viewerIds = [...new Set(views.map(view => view.viewer_id))]
      const profiles = viewerIds.length ? await cloudRest<Pick<Profile, 'id' | 'display_name'>[]>(`profiles?select=id,display_name&id=${apiFilter(viewerIds)}`) : []
      setStoryViewers(views.map(view => ({ id: view.viewer_id, display_name: profiles.find(profile => profile.id === view.viewer_id)?.display_name ?? t('cloud.members.member'), viewed_at: view.viewed_at })))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('cloud.error.loadStoryViews'))
    }
  }

  async function searchMessages(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = messageSearchQuery.trim().slice(0, 100)
    if (!query) return
    setMessageSearchBusy(true)
    setMessageSearchResults([])
    setError('')
    try {
      const results = await cloudRest<Message[]>(`messages?select=id,conversation_id,sender_id,content,created_at,reply_to_message_id,deleted_for_everyone,edited_at,pinned_at&content=ilike.%25${encodeURIComponent(query)}%25&deleted_for_everyone=eq.false&order=created_at.desc&limit=40`)
      setMessageSearchResults(results)
    } catch (cause) {
      setMessageSearchResults([])
      setError(cause instanceof Error ? cause.message : t('cloud.error.loadMessages'))
    } finally { setMessageSearchBusy(false) }
  }

  async function toggleStoryReaction(storyId: string) {
    if (!session) return
    try {
      const existing = await cloudRest<{ emoji: string }[]>(`story_reactions?select=emoji&story_id=eq.${storyId}&user_id=eq.${session.user.id}&emoji=eq.%F0%9F%91%8D`)
      if (existing.length) {
        await cloudRest<void>(`story_reactions?story_id=eq.${storyId}&user_id=eq.${session.user.id}&emoji=eq.%F0%9F%91%8D`, { method: 'DELETE' })
      } else {
        await cloudRest<void>('story_reactions', { method: 'POST', body: JSON.stringify({ story_id: storyId, user_id: session.user.id, emoji: '👍' }) })
      }
      setStatus(t('cloud.stories.reactionSaved'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('cloud.error.storyReaction'))
    }
  }

  async function publishTextStory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session || (!storyText.trim() && !storyImage)) return
    if (storyImage) {
      const validation = validateStoryImage(storyImage)
      if (validation) { setError(t(validation === 'imageTypeInvalid' ? 'cloud.stories.imageTypeInvalid' : 'cloud.error.storyImageSize')); return }
    }
    setBusy(true); setError('')
    let storagePath: string | null = null
    try {
      const storyId = crypto.randomUUID()
      if (storyImage) {
        const safeName = storyImage.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'story-image'
        storagePath = `stories/${session.user.id}/${storyId}/${safeName}`
        const controller = new AbortController()
        uploadAbortRef.current = controller
        setUploadKind('story')
        setUploadProgress(0)
        await cloudStorageUploadWithProgress(storagePath, storyImage, progress => setUploadProgress(progress), controller.signal)
        uploadAbortRef.current = null
        setUploadProgress(null)
        setUploadKind(null)
      }
      await cloudRest<string>('rpc/publish_story', {
        method: 'POST',
        body: JSON.stringify({ p_story_id: storyId, p_story_type: storyImage ? 'image' : 'text', p_text_content: storyText.trim(), p_storage_path: storagePath, p_audience: storyAudience, p_member_ids: storyAudienceMemberIds }),
      })
      setStoryText(''); setStoryImage(null); setStoryAudience('community'); setStoryAudienceMemberIds([]); setStoryComposer(false)
      await loadData()
      setStatus(t('cloud.stories.published'))
    } catch (cause) {
      if (storagePath) await cloudStorageRemove(storagePath).catch(() => {})
      setError(cause instanceof Error && cause.name === 'AbortError' ? t('cloud.messages.uploadCancelled') : cause instanceof Error ? cause.message : t('cloud.error.publishStory'))
    } finally { uploadAbortRef.current = null; setUploadProgress(null); setUploadKind(null); setBusy(false) }
  }

  if (!session) return <EmptyState icon={<Users />} title={t('cloud.auth.signInRequiredTitle')} description={t('cloud.auth.signInRequiredDescription')} />

  const activeConversation = conversations.find(item => item.id === activeId)
  const activeStoryIndex = activeStory ? stories.findIndex(story => story.id === activeStory.id) : -1
  const ownStory = stories.find(story => story.owner_id === session.user.id) ?? null

  return (
    <div className={`study-chat-environment study-chat-root relative -mx-4 -mt-5 min-h-[calc(100dvh-7rem)] overflow-hidden px-4 pb-8 pt-5 md:-mx-8 md:-mt-8 md:px-8 md:pt-8 ${mobileThreadOpen ? 'study-chat-thread-open' : ''}`}>
      <div aria-hidden="true" className="pointer-events-none absolute -end-32 top-10 size-[26rem] rounded-full bg-[radial-gradient(circle,oklch(0.55_0.2_292_/0.2),transparent_68%)] blur-3xl"/>
      <div aria-hidden="true" className="pointer-events-none absolute -start-40 bottom-8 size-[30rem] rounded-full bg-[radial-gradient(circle,oklch(0.52_0.17_245_/0.16),transparent_68%)] blur-3xl"/>
      <div className="study-chat-content relative mx-auto max-w-5xl space-y-5">
      <header className="study-chat-inbox-header study-glass-standard grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-[1.65rem] px-3 py-3 sm:px-5">
        <div className="flex items-center gap-2 justify-self-start">
          <Button variant="ghost" size="sm" className="size-10 rounded-2xl p-0" onClick={() => setMessageSearchOpen(true)} aria-label={t('cloud.search.title')}><Search className="size-5" aria-hidden="true"/></Button>
        </div>
        <div className="min-w-0 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[.24em] text-primary/90">STUDY · COMMUNITY</p>
          <h2 className="mt-0.5 truncate text-xl font-semibold tracking-tight">{locale === 'ar' ? 'صندوق الوارد' : 'Inbox'}</h2>
        </div>
        <div className="flex items-center gap-1.5 justify-self-end">
          <Button variant="ghost" size="sm" className="size-9 rounded-xl p-0" onClick={() => { setDirectoryOpen(true); setMemberSearch('') }} aria-label={locale === 'ar' ? 'إضافة أشخاص' : 'Find people'}><Users className="size-5"/></Button>
          <Button variant="ghost" size="sm" className="relative size-9 rounded-xl p-0" onClick={() => setNotificationsOpen(value => !value)} aria-label={t('cloud.notifications.title')}><Bell className="size-5"/>{notifications.filter(item => !item.read_at).length ? <span className="absolute end-1 top-1 size-2 rounded-full bg-rose-400 ring-2 ring-background"/> : null}</Button>
          <div className="relative">
            <button type="button" onClick={() => setProfileOpen(value => !value)} disabled={busy} aria-label={t('cloud.profile.edit')} className="rounded-full ring-2 ring-primary/25 transition hover:ring-primary/60 disabled:opacity-50"><Avatar name={profile?.display_name ?? session.user.email ?? 'Study'} src={profile?.avatar_url ?? undefined} size="sm"/></button>
            <button type="button" onClick={() => setStoryComposer(value => !value)} aria-label={locale === 'ar' ? 'إضافة قصة' : 'Add story'} className="absolute -bottom-1 -end-1 grid size-5 place-items-center rounded-full border-2 border-background bg-gradient-to-br from-violet-500 to-blue-500 text-white shadow-lg"><Plus className="size-3.5"/></button>
          </div>
        </div>
      </header>
      {notificationsOpen ? <section className="study-glass-standard rounded-2xl p-3"><h3 className="mb-2 font-semibold">{t('cloud.notifications.title')}</h3>{notifications.length ? <div className="max-h-64 overflow-y-auto">{notifications.map(notification => <button key={notification.id} type="button" onClick={() => void openNotification(notification)} className={`mb-1 block w-full rounded-xl p-3 text-start text-sm transition hover:bg-secondary/60 ${notification.read_at ? 'opacity-70' : 'bg-primary/10'}`}><span className="block font-medium">{notificationLabel(notification)}</span><span className="mt-1 block text-xs text-muted-foreground">{members.find(item => item.id === notification.actor_id)?.display_name ?? t('cloud.members.member')} · {new Date(notification.created_at).toLocaleTimeString(locale === 'ar' ? 'ar-EG' : 'en-US')}</span></button>)}</div> : <p className="text-sm text-muted-foreground">{t('cloud.notifications.empty')}</p>}</section> : null}
      {profileOpen ? <form onSubmit={saveProfile} className="study-glass-elevated grid gap-3 rounded-[1.65rem] p-4 sm:grid-cols-3"><div className="flex items-center gap-3 sm:col-span-3"><Avatar name={profileName} src={profile?.avatar_url ?? undefined} size="lg"/><div className="grid min-w-0 gap-1.5"><Label htmlFor="profile-avatar">{t('cloud.profile.avatar')}</Label><input id="profile-avatar" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" disabled={busy} onChange={event => setProfileAvatarFile(event.target.files?.[0] ?? null)} className="max-w-full text-xs"/>{profileAvatarFile ? <p className="truncate text-xs text-muted-foreground">{profileAvatarFile.name}</p> : <p className="text-xs text-muted-foreground">{t('cloud.profile.avatarHint')}</p>}</div></div>{uploadProgress !== null && uploadKind === 'avatar' ? <div className="flex items-center gap-2 rounded-xl bg-secondary/50 p-2 sm:col-span-3"><progress value={uploadProgress} max={100} aria-label={t('cloud.messages.uploadProgress')} className="h-2 min-w-0 flex-1"/><span className="text-xs tabular-nums">{uploadProgress}%</span><Button type="button" size="sm" variant="ghost" onClick={cancelUpload}>{t('cloud.messages.cancelUpload')}</Button></div> : null}<div className="grid gap-1"><Label htmlFor="profile-display-name">{t('cloud.profile.displayName')}</Label><Input id="profile-display-name" value={profileName} onChange={e => setProfileName(e.target.value)} required maxLength={80} disabled={busy}/></div><div className="grid gap-1"><Label htmlFor="profile-username">{t('cloud.profile.username')}</Label><Input id="profile-username" value={profileUsername} onChange={e => setProfileUsername(e.target.value)} minLength={3} maxLength={24} placeholder={t('cloud.profile.username')} disabled={busy}/></div><div className="grid gap-1"><Label htmlFor="profile-bio">{t('cloud.profile.bio')}</Label><Input id="profile-bio" value={profileBio} onChange={e => setProfileBio(e.target.value)} maxLength={160} placeholder={t('cloud.profile.bio')} disabled={busy}/></div><Button type="submit" disabled={busy || !profileName.trim()}>{t('cloud.profile.save')}</Button></form> : null}

      {error ? <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      {status ? <p role="status" className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-muted-foreground">{status}</p> : null}

      {error ? <p role="alert" className="study-glass-standard rounded-2xl border border-danger/30 px-3 py-2 text-sm text-danger">{error}</p> : null}
      {status ? <p role="status" className="study-glass-subtle rounded-xl px-3 py-2 text-sm text-muted-foreground">{status}</p> : null}

      <section className="study-chat-stories space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div><h3 className="font-semibold">{t('cloud.stories.title')}</h3><p className="text-xs text-muted-foreground">{t('cloud.stories.publishedSubtitle')}</p></div>
          <button type="button" onClick={() => setStoryComposer(value => !value)} className="study-glass-subtle flex size-10 shrink-0 items-center justify-center rounded-2xl text-primary" aria-label={t('cloud.stories.add')}><Plus className="size-5"/></button>
        </div>
        {storyComposer ? <form onSubmit={publishTextStory} className="study-glass-elevated mb-3 grid gap-3 rounded-3xl p-4"><Label htmlFor="cloud-story">{t('cloud.stories.textCaption')}</Label><Textarea id="cloud-story" value={storyText} onChange={e => setStoryText(e.target.value)} maxLength={500} placeholder={t('cloud.stories.placeholder')} disabled={busy}/><Label htmlFor="cloud-story-image">{t('cloud.stories.image')}</Label><input id="cloud-story-image" type="file" accept="image/*" capture="environment" disabled={busy} onChange={e => setStoryImage(e.target.files?.[0] ?? null)} className="text-xs"/>{storyImage ? <p className="truncate text-xs text-muted-foreground">{storyImage.name} · <button type="button" onClick={() => setStoryImage(null)}>{t('cloud.stories.remove')}</button></p> : null}{uploadProgress !== null && uploadKind === 'story' ? <div className="flex items-center gap-2 rounded-xl bg-secondary/50 p-2"><progress value={uploadProgress} max={100} aria-label={t('cloud.messages.uploadProgress')} className="h-2 min-w-0 flex-1"/><span className="text-xs tabular-nums">{uploadProgress}%</span><Button type="button" size="sm" variant="ghost" onClick={cancelUpload}>{t('cloud.messages.cancelUpload')}</Button></div> : null}<fieldset disabled={busy} className="grid gap-2 rounded-2xl border border-border/70 p-3"><legend className="px-1 text-xs font-semibold">{t('cloud.stories.audience')}</legend><label className="flex items-center gap-2 text-sm"><input type="radio" checked={storyAudience === 'community'} onChange={() => setStoryAudience('community')}/>{t('cloud.stories.community')}</label><label className="flex items-center gap-2 text-sm"><input type="radio" checked={storyAudience === 'selected-members'} onChange={() => setStoryAudience('selected-members')}/>{t('cloud.stories.selected')}</label>{storyAudience === 'selected-members' ? <div className="max-h-32 overflow-y-auto">{filteredMembers.map(member => <label key={member.id} className="flex items-center gap-2 py-1 text-xs"><input type="checkbox" checked={storyAudienceMemberIds.includes(member.id)} onChange={e => setStoryAudienceMemberIds(current => e.target.checked ? [...current, member.id] : current.filter(id => id !== member.id))}/><span>{member.display_name}</span></label>)}</div> : null}</fieldset><Button type="submit" disabled={busy || (!storyText.trim() && !storyImage) || (storyAudience === 'selected-members' && !storyAudienceMemberIds.length)}>{t('cloud.stories.publish')}</Button></form> : null}
        <div className="flex gap-4 overflow-x-auto pb-2 pt-1 scrollbar-thin" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          <div className="relative flex w-[4.75rem] shrink-0 flex-col items-center gap-2">
            <button type="button" onClick={() => ownStory ? void openStory(ownStory) : setStoryComposer(true)} className="group flex flex-col items-center gap-2 text-center" aria-label={locale === 'ar' ? 'قصتي' : 'Your story'}>
              <span className="study-chat-story-ring flex size-[4.35rem] items-center justify-center rounded-full p-[3px]" data-seen={ownStory ? String(seenStoryIds.includes(ownStory.id)) : 'false'}><span className="flex size-full items-center justify-center overflow-hidden rounded-full border-2 border-background bg-secondary"><Avatar name={profile?.display_name ?? 'Study'} src={profile?.avatar_url ?? undefined} size="lg" className="size-full"/></span></span>
              <span className="w-full truncate text-xs font-medium">{locale === 'ar' ? 'قصتك' : 'Your story'}</span>
            </button>
            <button type="button" onClick={() => setStoryComposer(true)} aria-label={locale === 'ar' ? 'إنشاء قصة' : 'Create story'} className="absolute right-0 top-0 grid size-6 place-items-center rounded-full border-2 border-background bg-gradient-to-br from-violet-500 to-blue-500 text-white shadow-lg"><Plus className="size-3.5"/></button>
          </div>
          {Array.from(new Map(stories.filter(story => story.owner_id !== session.user.id).map(story => [story.owner_id, story])).values()).map(story => {
            const owner = members.find(item => item.id === story.owner_id)
            const ownerName = owner?.display_name ?? t('cloud.members.member')
            const ownerStories = stories.filter(item => item.owner_id === story.owner_id)
            const seen = ownerStories.every(item => seenStoryIds.includes(item.id))
            return <button key={story.owner_id} type="button" aria-label={`${ownerName} · ${seen ? t('cloud.stories.seen') : t('cloud.stories.unseen')}`} onClick={() => void openStory(story)} className="group flex w-[4.75rem] shrink-0 flex-col items-center gap-2 text-center">
              <span className="study-chat-story-ring flex size-[4.35rem] items-center justify-center rounded-full p-[3px]" data-seen={String(seen)}><span className="flex size-full items-center justify-center overflow-hidden rounded-full border-2 border-background bg-secondary">{story.signed_url ? <img src={story.signed_url} alt="" className="size-full object-cover" loading="lazy"/> : <Avatar name={ownerName} src={owner?.avatar_url ?? undefined} size="lg" className="size-full"/>}</span></span>
              <span className="w-full truncate text-xs font-medium">{ownerName}</span>
            </button>
          })}
          {dataLoading ? Array.from({ length: 4 }, (_, index) => <div key={index} className="flex w-[4.75rem] shrink-0 flex-col items-center gap-2" aria-hidden="true"><span className="size-[4.35rem] animate-pulse rounded-full bg-secondary/70 p-1"/><span className="h-3 w-12 animate-pulse rounded-full bg-secondary"/></div>) : null}
        </div>
      </section>

      {notifications.length ? <section className="study-chat-activity study-glass-elevated overflow-hidden rounded-[1.6rem]">
        <button type="button" onClick={() => setNotificationsOpen(value => !value)} className="flex w-full items-center gap-3 p-4 text-start">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-500/25 to-blue-500/20 text-primary"><Sparkles className="size-5"/></span>
          <span className="min-w-0 flex-1"><span className="block font-semibold">{locale === 'ar' ? 'النشاط والإشعارات الجديدة' : 'Activity & new updates'}</span><span className="mt-1 block truncate text-sm text-muted-foreground">{notificationLabel(notifications[0])} · {members.find(item => item.id === notifications[0].actor_id)?.display_name ?? t('cloud.members.member')}</span></span>
          {notifications.filter(item => !item.read_at).length ? <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">{notifications.filter(item => !item.read_at).length}</span> : <Bell className="size-4 text-muted-foreground"/>}
        </button>
        {notificationsOpen ? <div className="border-t border-border/60 p-2">{notifications.map(notification => <button key={notification.id} type="button" onClick={() => void openNotification(notification)} className={`mb-1 block w-full rounded-xl p-3 text-start text-sm transition hover:bg-secondary/60 ${notification.read_at ? 'opacity-70' : 'bg-primary/10'}`}><span className="block font-medium">{notificationLabel(notification)}</span><span className="mt-1 block text-xs text-muted-foreground">{members.find(item => item.id === notification.actor_id)?.display_name ?? t('cloud.members.member')} · {new Date(notification.created_at).toLocaleTimeString(locale === 'ar' ? 'ar-EG' : 'en-US')}</span></button>)}</div> : null}
      </section> : null}

      <div className="study-chat-inbox-grid study-glass-standard grid min-h-[34rem] overflow-hidden rounded-[1.8rem] md:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className={`${mobileThreadOpen ? 'hidden md:block' : 'block'} study-chat-directory border-b border-border md:border-b-0 md:border-e`}>
          <div className="border-b border-border p-3"><div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">{t('cloud.conversations.title')}</h3><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setDirectoryOpen(value => !value)} aria-pressed={directoryOpen}><Users data-icon="inline-start"/>{t('cloud.members.title')}</Button><Button size="sm" variant="ghost" onClick={() => setGroupComposerOpen(value => !value)}><Plus data-icon="inline-start"/>{t('cloud.members.group')}</Button></div></div><div className={`${directoryOpen ? 'block' : 'hidden'} relative`}><Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input className="ps-9" value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder={t('cloud.members.search')}/></div>
            {groupComposerOpen ? <form onSubmit={createGroup} className="mt-3 grid gap-2 rounded-xl bg-secondary/50 p-3"><Label htmlFor="group-title">{t('cloud.members.groupName')}</Label><Input id="group-title" value={groupTitle} onChange={e => setGroupTitle(e.target.value)} maxLength={80} required placeholder={t('cloud.members.groupName')} disabled={busy}/><div className="grid gap-1"><Label htmlFor="group-image">{t('cloud.members.groupImage')}</Label><input id="group-image" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" disabled={busy} onChange={event => setGroupImageFile(event.target.files?.[0] ?? null)} className="max-w-full text-xs"/>{groupImageFile ? <p className="truncate text-xs text-muted-foreground">{groupImageFile.name}</p> : null}</div>{uploadProgress !== null && uploadKind === 'group' ? <div className="flex items-center gap-2 rounded-xl bg-background/60 p-2"><progress value={uploadProgress} max={100} aria-label={t('cloud.messages.uploadProgress')} className="h-2 min-w-0 flex-1"/><span className="text-xs tabular-nums">{uploadProgress}%</span><Button type="button" size="sm" variant="ghost" onClick={cancelUpload}>{t('cloud.messages.cancelUpload')}</Button></div> : null}<div className="max-h-32 overflow-y-auto">{filteredMembers.map(member => <label key={member.id} className="flex items-center gap-2 py-1 text-xs"><input type="checkbox" disabled={busy} checked={selectedGroupMembers.includes(member.id)} onChange={e => setSelectedGroupMembers(current => e.target.checked ? [...current, member.id] : current.filter(id => id !== member.id))}/><Avatar name={member.display_name} src={member.avatar_url ?? undefined} size="sm"/><span className="truncate">{member.display_name}</span></label>)}</div><Button size="sm" type="submit" disabled={busy || !groupTitle.trim() || selectedGroupMembers.length === 0}>{t('cloud.members.createGroup')}</Button></form> : null}
          </div>
          <div className={`study-chat-member-list ${directoryOpen ? 'block' : 'hidden'} max-h-72 overflow-y-auto p-2 md:max-h-[28rem]`}>
            {filteredMembers.map(member => {
              const online = onlineUserIds.includes(member.id)
              return <div key={member.id} className="study-chat-member-row mb-1 flex items-center gap-3 rounded-2xl p-2.5" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
                <button type="button" onClick={() => setProfilePreview(member)} aria-label={locale === 'ar' ? `عرض ملف ${member.display_name}` : `View ${member.display_name}'s profile`} className="relative shrink-0 rounded-full focus-visible:outline">
                  <Avatar name={member.display_name} src={member.avatar_url ?? undefined} size="lg"/>
                  {online ? <span className="absolute bottom-0 end-0 size-3 rounded-full border-2 border-card bg-emerald-400" aria-label={locale === 'ar' ? 'متصل الآن' : 'Online'}/> : null}
                </button>
                <button type="button" onClick={() => void startDirect(member)} disabled={busy} className="min-w-0 flex-1 text-start disabled:opacity-50">
                  <span className="block truncate text-sm font-semibold">{member.display_name}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{member.username ? `@${member.username}` : member.bio ?? t('cloud.members.member')}</span>
                </button>
                <button type="button" onClick={() => { setStoryAudience('selected-members'); setStoryAudienceMemberIds([member.id]); setStoryComposer(true); window.setTimeout(() => document.getElementById('cloud-story-image')?.click(), 160) }} aria-label={locale === 'ar' ? `التقاط قصة لـ ${member.display_name}` : `Capture a story for ${member.display_name}`} title={locale === 'ar' ? 'قصة لهذا الشخص' : 'Story for this person'} className="grid size-10 shrink-0 place-items-center rounded-xl text-muted-foreground transition hover:bg-secondary hover:text-primary">
                  <Camera className="size-5"/>
                </button>
              </div>
            })}
            {!filteredMembers.length ? dataLoading ? <div className="grid gap-2 p-2" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <div key={index} className="flex items-center gap-3 rounded-xl p-3"><span className="size-10 animate-pulse rounded-full bg-secondary"/><span className="h-3 w-28 rounded bg-secondary"/></div>)}</div> : <p className="p-3 text-xs text-muted-foreground">{t('cloud.members.noMembers')}</p> : null}
          </div>
          <div className="border-t border-border p-3"><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">{t('cloud.conversations.title')}</h3><span className="text-[11px] text-muted-foreground">{conversations.length}</span></div>{conversations.map(conversation => <button key={conversation.id} type="button" aria-current={activeId === conversation.id ? 'page' : undefined} onClick={() => { setActiveId(conversation.id); setMobileThreadOpen(true) }} className={activeId === conversation.id ? 'mb-1 flex w-full items-center gap-3 rounded-2xl bg-primary/10 p-3 text-start text-sm ring-1 ring-primary/25' : 'mb-1 flex w-full items-center gap-3 rounded-2xl p-3 text-start text-sm transition-colors hover:bg-secondary'}><Avatar name={conversation.title ?? peerNames[conversation.id] ?? t('cloud.conversations.private')} src={conversation.avatar_url ?? peerAvatars[conversation.id] ?? undefined} size="md"/><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-1.5"><span className="truncate font-semibold">{conversation.title ?? peerNames[conversation.id] ?? t('cloud.conversations.private')}</span>{conversationPreferences[conversation.id]?.pinned ? <Pin className="size-3.5 shrink-0 text-primary" aria-label={t('cloud.conversations.pinned')}/> : null}{conversationPreferences[conversation.id]?.muted ? <BellOff className="size-3.5 shrink-0 text-muted-foreground" aria-label={t('cloud.conversations.muted')}/> : null}</span><span className="shrink-0 text-[10px] text-muted-foreground">{new Date(conversation.last_message_at ?? conversation.created_at).toLocaleTimeString(locale === 'ar' ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: '2-digit' })}</span></span><span className="mt-1 block truncate text-xs text-muted-foreground">{conversationPreviews[conversation.id] || (conversation.kind === 'group' ? t('cloud.members.group') : t('cloud.conversations.private'))}</span></span>{unreadCounts[conversation.id] ? <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">{unreadCounts[conversation.id]}</span> : null}</button>)}{!conversations.length ? dataLoading ? <div className="grid gap-2 p-2" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <div key={index} className="flex items-center gap-3 rounded-2xl p-3"><span className="size-11 animate-pulse rounded-full bg-secondary"/><span className="min-w-0 flex-1"><span className="mb-2 block h-3 w-2/3 animate-pulse rounded bg-secondary"/><span className="block h-2.5 w-1/2 animate-pulse rounded bg-secondary/70"/></span></div>)}</div> : <div className="rounded-2xl bg-secondary/40 p-4 text-center"><p className="text-sm leading-6 text-muted-foreground">{t('cloud.conversations.emptyInbox')}</p><Button size="sm" variant="outline" className="mt-3 rounded-xl" onClick={() => setDirectoryOpen(true)}><Users data-icon="inline-start"/>{t('cloud.members.title')}</Button></div> : null}</div>
        </aside>
        <section className={`${mobileThreadOpen ? 'flex' : 'hidden md:flex'} study-chat-conversation min-h-[25rem] min-w-0 flex-col bg-background/25`}>
          {activeConversation ? <><header className="study-chat-conversation-header study-glass-subtle flex items-center gap-3 border-b border-border/60 p-3 sm:p-4"><Button type="button" size="sm" variant="ghost" className="size-9 shrink-0 rounded-xl p-0 md:hidden" aria-label={t('chats.backToChats')} onClick={() => setMobileThreadOpen(false)}><ArrowLeft className="rtl:-scale-x-100"/></Button><Avatar name={activeConversation.title ?? peerNames[activeConversation.id] ?? t('cloud.conversations.private')} src={activeConversation.avatar_url ?? peerAvatars[activeConversation.id] ?? undefined} size="md"/><div className="min-w-0 flex-1"><h3 className="truncate font-semibold">{activeConversation.title ?? peerNames[activeConversation.id] ?? t('cloud.conversations.private')}</h3><p className="text-xs text-muted-foreground">{realtimeConnected ? t('cloud.realtime.connected') : t('cloud.realtime.polling')} · {onlineUserIds.length} {t('cloud.realtime.online')}</p></div><div className="flex shrink-0 items-center gap-1"><Button size="sm" variant="ghost" className="size-8 rounded-lg p-0" aria-label={conversationPreferences[activeId]?.pinned ? t('cloud.conversations.unpin') : t('cloud.conversations.pin')} title={conversationPreferences[activeId]?.pinned ? t('cloud.conversations.unpin') : t('cloud.conversations.pin')} onClick={() => void toggleConversationPreference('pinned')}><Pin className={conversationPreferences[activeId]?.pinned ? 'size-4 fill-current text-primary' : 'size-4'}/></Button><Button size="sm" variant="ghost" className="size-8 rounded-lg p-0" aria-label={conversationPreferences[activeId]?.muted ? t('cloud.conversations.unmute') : t('cloud.conversations.mute')} title={conversationPreferences[activeId]?.muted ? t('cloud.conversations.unmute') : t('cloud.conversations.mute')} onClick={() => void toggleConversationPreference('muted')}><BellOff className={conversationPreferences[activeId]?.muted ? 'size-4 text-primary' : 'size-4'}/></Button>{activeConversation.kind === 'group' ? <Button size="sm" variant="outline" onClick={() => setManageGroupOpen(value => !value)}>{t('cloud.group.manageMembers')}</Button> : null}</div></header>
          {manageGroupOpen && activeConversation.kind === 'group' ? <section className="border-b border-border bg-card p-3"><h4 className="mb-2 text-sm font-semibold">{t('cloud.group.manageMembers')}</h4><div className="mb-3 grid gap-1">{(conversationMembers[activeId] ?? []).map(member => <div key={member.user_id} className="flex items-center justify-between gap-2 rounded-md bg-secondary/50 px-2 py-1.5 text-xs"><span className="truncate">{members.find(item => item.id === member.user_id)?.display_name ?? (member.user_id === session.user.id ? profile?.display_name : t('cloud.members.member'))} · {t(member.role === 'owner' ? 'cloud.group.owner' : member.role === 'admin' ? 'cloud.group.admin' : 'cloud.group.member')}</span>{member.user_id === session.user.id || ['owner','admin'].includes(conversationMembers[activeId]?.find(item => item.user_id === session.user.id)?.role ?? '') ? <Button size="sm" variant="ghost" onClick={() => void removeGroupMember(member.user_id)} disabled={busy}>{member.user_id === session.user.id ? t('cloud.group.leave') : t('cloud.group.removeMember')}</Button> : null}</div>)}</div><form onSubmit={addGroupMembers} className="grid gap-2"><h5 className="text-xs font-semibold">{t('cloud.group.addMembers')}</h5><div className="max-h-32 overflow-y-auto">{filteredMembers.filter(member => !(conversationMembers[activeId] ?? []).some(current => current.user_id === member.id)).map(member => <label key={member.id} className="flex items-center gap-2 py-1 text-xs"><input type="checkbox" checked={groupAddMemberIds.includes(member.id)} onChange={e => setGroupAddMemberIds(current => e.target.checked ? [...current, member.id] : current.filter(id => id !== member.id))}/><span>{member.display_name}</span></label>)}</div><Button size="sm" type="submit" disabled={busy || !groupAddMemberIds.length}>{t('cloud.group.addMembers')}</Button></form></section> : null}<div className="flex-1 space-y-3 overflow-y-auto p-4" role="log" aria-live="polite">{messages.map(message => <article id={`cloud-message-${message.id}`} key={message.id} className={`study-chat-message max-w-[85%] rounded-[1.35rem] px-3.5 py-2.5 text-sm ${message.sender_id === session.user.id ? 'study-chat-message-outgoing ms-auto rounded-ee-md' : 'study-chat-message-incoming rounded-es-md'} ${jumpToMessageId === message.id ? 'ring-2 ring-primary/70' : ''}`}>
            {message.reply_to_message_id ? <p className="mb-2 rounded-md border-s-2 border-primary/60 px-2 py-1 text-xs text-muted-foreground">{messages.find(item => item.id === message.reply_to_message_id)?.content ?? 'Reply to message'}</p> : null}
            {editingMessageId === message.id ? <div className="grid gap-2"><Textarea value={editingText} onChange={e => setEditingText(e.target.value)} maxLength={10000}/><div className="flex gap-1"><Button size="sm" onClick={() => void editMessage(message.id)} disabled={!editingText.trim()}>{t('cloud.messages.saveEdit')}</Button><Button size="sm" variant="ghost" onClick={() => setEditingMessageId(null)}>{t('cloud.messages.cancel')}</Button></div></div> : <p dir="auto">{message.deleted_for_everyone ? t('cloud.messages.deleted') : message.content || (message.pending_attachment ? (locale === 'ar' ? 'مرفق محفوظ للإرسال' : 'Attachment queued to send') : '')}</p>}
            {(messageAttachments[message.id] ?? []).map(attachment => attachment.mime_type.startsWith('image/') ? <a key={attachment.id} href={attachment.signed_url} target="_blank" rel="noreferrer" className="mt-2 block"><img src={attachment.signed_url} alt={attachment.file_name} className="max-h-64 max-w-full rounded-lg object-contain" loading="lazy"/></a> : attachment.mime_type.startsWith('audio/') || attachment.mime_type.startsWith('video/') ? <audio key={attachment.id} controls preload="metadata" src={attachment.signed_url} className="mt-2 max-w-full"/> : <a key={attachment.id} href={attachment.signed_url} download={attachment.file_name} className="mt-2 block truncate text-xs underline">{attachment.file_name} · {Math.ceil(attachment.file_size / 1024)} KB</a>)}
            <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">{message.pinned_at ? '📌 ' : ''}{message.edited_at ? t('cloud.messages.edited') + ' · ' : ''}{new Date(message.created_at).toLocaleTimeString(locale === 'ar' ? 'ar-EG' : 'en-US')}{message.pending ? <span>{locale === 'ar' ? '· في انتظار الاتصال' : '· queued'}</span> : message.sender_id === session.user.id ? <span aria-label={messageReceiptStatus[message.id] ?? 'sent'} className={messageReceiptStatus[message.id] === 'read' ? 'text-primary' : ''}>{messageReceiptStatus[message.id] === 'read' ? '✓✓' : messageReceiptStatus[message.id] === 'delivered' ? '✓' : '·'}</span> : null}</p>
            <div className={`mt-1 flex flex-wrap items-center justify-end gap-1 ${message.pending ? 'pointer-events-none opacity-40' : ''}`}>
              <button type="button" className="rounded px-1.5 py-0.5 text-[11px] hover:bg-background/60" onClick={() => setReplyToMessageId(message.id)}>{t('cloud.messages.reply')}</button>
              <button type="button" aria-pressed={(messageReactions[message.id] ?? []).includes('❤️')} className="rounded px-1.5 py-0.5 text-[11px] hover:bg-background/60" onClick={() => void toggleMessageReaction(message.id, '❤️')}>❤️ {(messageReactions[message.id] ?? []).filter(value => value === '❤️').length || ''}</button>
              <button type="button" aria-pressed={(messageReactions[message.id] ?? []).includes('👍')} className="rounded px-1.5 py-0.5 text-[11px] hover:bg-background/60" onClick={() => void toggleMessageReaction(message.id, '👍')}>👍 {(messageReactions[message.id] ?? []).filter(value => value === '👍').length || ''}</button>
              {message.sender_id === session.user.id && !message.deleted_for_everyone ? <><button type="button" className="rounded px-1.5 py-0.5 text-[11px] hover:bg-background/60" onClick={() => { setEditingMessageId(message.id); setEditingText(message.content) }}>{t('cloud.messages.edit')}</button><button type="button" className="rounded px-1.5 py-0.5 text-[11px] hover:bg-background/60" onClick={() => void deleteMessage(message.id)}>{t('cloud.messages.delete')}</button></> : null}
              <button type="button" className="rounded px-1.5 py-0.5 text-[11px] hover:bg-background/60" onClick={() => void pinMessage(message.id, !message.pinned_at)}>{message.pinned_at ? t('cloud.messages.unpin') : t('cloud.messages.pin')}</button>
              <button type="button" className="rounded px-1.5 py-0.5 text-[11px] hover:bg-background/60" onClick={() => { setForwardingMessageId(forwardingMessageId === message.id ? null : message.id); setForwardTargetId('') }}>{t('cloud.messages.forward')}</button>
            </div>
            {forwardingMessageId === message.id ? <div className="mt-2 flex gap-2"><select aria-label="Forward to conversation" value={forwardTargetId} onChange={e => setForwardTargetId(e.target.value)} className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs"><option value="">{t('cloud.conversations.chooseOption')}</option>{conversations.filter(item => item.id !== activeId).map(item => <option key={item.id} value={item.id}>{item.title ?? peerNames[item.id] ?? t('cloud.conversations.private')}</option>)}</select><Button size="sm" onClick={() => void forwardMessage(message)} disabled={!forwardTargetId}>{t('cloud.messages.forward')}</Button></div> : null}
          </article>)}{!messages.length ? <p className="text-sm text-muted-foreground">{t('cloud.messages.empty')}</p> : null}</div>{typingUserId ? <p className="px-4 py-2 text-xs text-muted-foreground">{members.find(item => item.id === typingUserId)?.display_name ?? t('cloud.members.member')} {t('cloud.messages.typing')}</p> : null}<form onSubmit={sendMessage} className="study-chat-composer flex flex-col gap-2 border-t border-border/60 p-3 sm:p-4">{replyToMessageId ? <div className="flex items-center justify-between rounded-md bg-secondary px-2 py-1 text-xs"><span className="truncate">{t('chats.message.replying')}: {messages.find(item => item.id === replyToMessageId)?.content ?? 'message'}</span><button type="button" onClick={() => setReplyToMessageId(null)}>{t('cloud.messages.cancel')}</button></div> : null}{selectedFile ? <p className="text-xs text-muted-foreground">{t('cloud.messages.attachmentLabel')}: {selectedFile.name} · <button type="button" onClick={() => setSelectedFile(null)}>{t('cloud.stories.remove')}</button></p> : null}{voiceBlob ? <div className="grid gap-1 rounded-xl bg-secondary/50 p-2"><p className="text-xs text-muted-foreground">{t('cloud.messages.voiceReadyLabel')} · {formatMediaDuration(voiceDurationMs)} · <button type="button" onClick={() => { setVoiceBlob(null); setVoiceDurationMs(0) }}>{t('cloud.stories.remove')}</button></p><audio ref={voicePreviewRef} controls className="w-full" aria-label={t('cloud.messages.voicePreview')}/></div> : null}{uploadProgress !== null && uploadKind === 'message' ? <div className="flex items-center gap-2 rounded-xl bg-secondary/50 p-2"><progress value={uploadProgress} max={100} aria-label={t('cloud.messages.uploadProgress')} className="h-2 min-w-0 flex-1"/><span className="text-xs tabular-nums">{uploadProgress}%</span><Button type="button" size="sm" variant="ghost" onClick={cancelUpload}>{t('cloud.messages.cancelUpload')}</Button></div> : null}{recording ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><span role="status">{t('cloud.messages.recording')} · {formatMediaDuration(recordingSeconds * 1000)}</span><Button type="button" size="sm" variant="ghost" className="ms-auto" onClick={cancelVoiceRecording}><X data-icon="inline-start"/>{t('cloud.messages.cancelRecording')}</Button></div> : null}<div className="flex gap-2"><input type="file" className="hidden" id="cloud-chat-file" accept="image/*,application/pdf,text/plain" onChange={e => { setSelectedFile(e.target.files?.[0] ?? null); setVoiceBlob(null); setVoiceDurationMs(0) }}/><Button type="button" size="sm" className="size-9 p-0" variant="outline" aria-label={t('cloud.messages.attach')} disabled={busy || recording} onClick={() => document.getElementById('cloud-chat-file')?.click()}><Paperclip/></Button><Button type="button" size="sm" className="size-9 p-0" variant={recording ? 'danger' : 'outline'} aria-label={recording ? t('cloud.messages.stopVoice') : t('cloud.messages.voice')} onClick={() => recording ? stopVoiceRecording() : void startVoiceRecording()}>{recording ? <Square/> : <Mic/>}</Button><Input value={messageText} onChange={e => { setMessageText(e.target.value); realtimeRef.current?.broadcast('typing', { user_id: session.user.id, typing: true }) }} placeholder={t('cloud.messages.write')} aria-label={t('cloud.messages.write')} disabled={busy || recording} /><Button type="submit" disabled={busy || recording || (!messageText.trim() && !selectedFile && !voiceBlob)}><Send data-icon="inline-start"/>{t('cloud.messages.send')}</Button></div></form></> : <div className="flex flex-1 items-center justify-center p-6 text-center"><EmptyState icon={<BookOpen/>} title={t('cloud.conversations.choose')} description={t('cloud.conversations.chooseDescription')}/></div>}
        </section>
      </div>
      <Dialog open={messageSearchOpen} onOpenChange={setMessageSearchOpen}>
        <DialogContent className="max-w-xl rounded-3xl">
          <DialogTitle>{t('cloud.search.title')}</DialogTitle>
          <DialogDescription>{t('cloud.search.description')}</DialogDescription>
          <form onSubmit={searchMessages} className="mt-4 flex gap-2">
            <Input value={messageSearchQuery} onChange={event => setMessageSearchQuery(event.target.value)} placeholder={t('cloud.search.placeholder')} aria-label={t('cloud.search.placeholder')} autoFocus />
            <Button type="submit" size="sm" disabled={messageSearchBusy || !messageSearchQuery.trim()}>{messageSearchBusy ? t('cloud.search.searching') : t('cloud.search.submit')}</Button>
          </form>
          <div className="mt-3 max-h-[55dvh] overflow-y-auto">
            {messageSearchResults.length ? messageSearchResults.map(result => <button key={result.id} type="button" onClick={() => { setActiveId(result.conversation_id); setMobileThreadOpen(true); setJumpToMessageId(result.id); setMessageSearchOpen(false) }} className="mb-1 block w-full rounded-xl p-3 text-start transition-colors hover:bg-secondary">
              <span className="block break-words text-sm" dir="auto">{result.content}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{conversations.find(item => item.id === result.conversation_id)?.title ?? peerNames[result.conversation_id] ?? t('cloud.conversations.private')} · {new Date(result.created_at).toLocaleTimeString(locale === 'ar' ? 'ar-EG' : 'en-US')}</span>
            </button>) : messageSearchQuery.trim() && !messageSearchBusy ? <p className="py-4 text-center text-sm text-muted-foreground">{t('cloud.search.noResults')}</p> : null}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={activeStory !== null} onOpenChange={open => { if (!open) { setActiveStory(null); setStoryViewers([]) } }}>
        <DialogContent className="study-glass-modal max-w-lg rounded-[1.8rem]">
          <DialogTitle>{t('cloud.stories.viewerTitle')}</DialogTitle>
          <DialogDescription>{activeStory ? new Date(activeStory.expires_at).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US') : ''}</DialogDescription>
          <div className="flex items-center justify-between gap-2">
            <Button size="sm" variant="outline" disabled={activeStoryIndex >= stories.length - 1} onClick={() => { const story = stories[activeStoryIndex + 1]; if (story) void openStory(story) }}>{t('cloud.stories.previous')}</Button>
            <Button size="sm" variant="outline" disabled={activeStoryIndex <= 0} onClick={() => { const story = stories[activeStoryIndex - 1]; if (story) void openStory(story) }}>{t('cloud.stories.next')}</Button>
          </div>
          {activeStory ? <div className="mt-3 grid gap-3">
            {activeStory.signed_url ? <img src={activeStory.signed_url} alt={t('cloud.stories.imageAlt')} className="max-h-[55dvh] w-full rounded-xl object-contain"/> : null}
            {activeStory.text_content ? <p className="whitespace-pre-wrap break-words rounded-xl bg-secondary p-4 text-base" dir="auto">{activeStory.text_content}</p> : null}
            <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{activeStory.audience === 'community' ? t('cloud.stories.community') : t('cloud.stories.selected')}</span><Button size="sm" variant="outline" onClick={() => void toggleStoryReaction(activeStory.id)} disabled={activeStory.owner_id === session.user.id}>👍 {t('cloud.stories.react')}</Button></div>
            {activeStory.owner_id === session.user.id ? <section className="border-t border-border pt-3"><h3 className="mb-2 text-sm font-semibold">{t('cloud.stories.viewers')} ({storyViewers.length})</h3>{storyViewers.length ? <ul className="max-h-32 overflow-y-auto">{storyViewers.map(viewer => <li key={viewer.id} className="flex justify-between gap-2 py-1 text-xs"><span>{viewer.display_name}</span><span className="text-muted-foreground">{new Date(viewer.viewed_at).toLocaleTimeString(locale === 'ar' ? 'ar-EG' : 'en-US')}</span></li>)}</ul> : <p className="text-xs text-muted-foreground">{t('cloud.stories.noViewers')}</p>}</section> : null}
          </div> : null}
        </DialogContent>
      </Dialog>
            <p className="text-xs text-muted-foreground">{t('cloud.messages.realtimeNote')}</p>
    </div>
  )
}
