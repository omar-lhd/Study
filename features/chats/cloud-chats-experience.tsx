'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { ArrowLeft, MessageCircle, Plus, Search, Send, Users, RefreshCw, CircleUserRound, BookOpen, Paperclip, Mic, Square, Bell } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/states'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { usePreferences } from '@/components/providers/preferences-provider'
import { cloudRest, cloudStorageRemove, cloudStorageSignedUrl, cloudStorageUpload, readCloudSession, subscribeCloudSession, subscribeConversationRealtime } from '@/lib/chats/cloud-client'

type Profile = { id: string; display_name: string; username: string | null; avatar_url: string | null; bio: string | null }
type Conversation = { id: string; kind: 'direct' | 'group'; title: string | null; last_message_at: string | null; created_at: string }
type Membership = { conversation_id: string; last_read_at: string | null; muted: boolean; pinned: boolean }
type Message = { id: string; conversation_id: string; sender_id: string; content: string; created_at: string; reply_to_message_id: string | null; deleted_for_everyone: boolean; edited_at: string | null; pinned_at: string | null }
type Story = { id: string; owner_id: string; story_type: 'text' | 'image'; text_content: string; storage_path: string | null; signed_url?: string; audience: 'community' | 'selected-members'; created_at: string; expires_at: string }
type CloudAttachment = { id: string; message_id: string; storage_path: string; file_name: string; mime_type: string; file_size: number; signed_url: string }
type CloudNotification = { id: string; actor_id: string | null; notification_type: string; payload: Record<string, unknown>; read_at: string | null; created_at: string }

function apiFilter(ids: string[]) {
  return `in.(${ids.map(id => `"${id}"`).join(',')})`
}

export function CloudChatsExperience() {
  const session = useSyncExternalStore(subscribeCloudSession, readCloudSession, () => null)
  const { t, locale } = usePreferences()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [members, setMembers] = useState<Profile[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [conversationPreviews, setConversationPreviews] = useState<Record<string, string>>({})
  const [messageReceiptStatus, setMessageReceiptStatus] = useState<Record<string, 'sent' | 'delivered' | 'read'>>({})
  const [peerNames, setPeerNames] = useState<Record<string, string>>({})
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
  const [recording, setRecording] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const [stories, setStories] = useState<Story[]>([])
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
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false)
  const [directoryOpen, setDirectoryOpen] = useState(false)
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
  const [groupComposerOpen, setGroupComposerOpen] = useState(false)
  const [manageGroupOpen, setManageGroupOpen] = useState(false)
  const [groupAddMemberIds, setGroupAddMemberIds] = useState<string[]>([])
  const [conversationMembers, setConversationMembers] = useState<Record<string, Array<{ user_id: string; role: string }>>>({})
  const [groupTitle, setGroupTitle] = useState('')
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([])



  const loadData = useCallback(async () => {
    if (!session) return
    setError('')
    try {
      const me = await cloudRest<Profile[]>(`profiles?select=id,display_name,username,avatar_url,bio&id=eq.${session.user.id}&limit=1`)
      setProfile(me[0] ?? null)
      if (me[0]) { setProfileName(me[0].display_name ?? ''); setProfileUsername(me[0].username ?? ''); setProfileBio(me[0].bio ?? '') }
      const directory = await cloudRest<Profile[]>('profiles?select=id,display_name,username,avatar_url,bio&order=display_name.asc&limit=100')
      setMembers(directory.filter(item => item.id !== session.user.id))
      const memberRows = await cloudRest<Membership[]>(`conversation_members?select=conversation_id,last_read_at,muted,pinned&user_id=eq.${session.user.id}`)
      if (memberRows.length) {
        const ids = memberRows.map(row => row.conversation_id)
        const convs = await cloudRest<Conversation[]>(`conversations?select=id,kind,title,last_message_at,created_at&id=${apiFilter(ids)}&order=last_message_at.desc.nullslast`)
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
        if (peerIds.length) {
          const peerProfiles = await cloudRest<Pick<Profile, 'id' | 'display_name'>[]>(`profiles?select=id,display_name&id=${apiFilter(peerIds)}`)
          const names: Record<string, string> = {}
          for (const row of allMembers) {
            const peer = peerProfiles.find(item => item.id === row.user_id)
            if (peer) names[row.conversation_id] = names[row.conversation_id] ? `${names[row.conversation_id]}, ${peer.display_name}` : peer.display_name
          }
          setPeerNames(names)
        } else setPeerNames({})
        if (!activeId && convs[0]) setActiveId(convs[0].id)
      } else { setConversations([]); setUnreadCounts({}); setConversationPreviews({}); setPeerNames({}); setConversationMembers({}) }
      const now = new Date().toISOString()
      const storyRows = await cloudRest<Story[]>(`stories?select=id,owner_id,story_type,text_content,storage_path,audience,created_at,expires_at&status=eq.published&expires_at=gt.${encodeURIComponent(now)}&order=created_at.desc&limit=50`)
      const storiesWithUrls = await Promise.all(storyRows.map(async story => story.storage_path ? { ...story, signed_url: await cloudStorageSignedUrl(story.storage_path) } : story))
      setStories(storiesWithUrls)
      const notificationRows = await cloudRest<CloudNotification[]>(`in_app_notifications?select=id,actor_id,notification_type,payload,read_at,created_at&recipient_id=eq.${session.user.id}&order=created_at.desc&limit=30`)
      setNotifications(notificationRows)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('cloud.error.loadChats'))
    }
  }, [session, activeId])

  // Async data loading is the external-system synchronization this effect exists for.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadData() }, [loadData])

  const loadMessages = useCallback(async () => {
    if (!activeId || !session) { setMessages([]); setMessageAttachments({}); return }
    try {
      const rows = await cloudRest<Message[]>(`messages?select=id,conversation_id,sender_id,content,created_at,reply_to_message_id,deleted_for_everyone,edited_at,pinned_at&conversation_id=eq.${activeId}&order=created_at.asc&limit=500`)
      setMessages(rows)
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
  }, [activeId, session])

  // Fetch messages when the selected conversation changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadMessages() }, [loadMessages])
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
      if (typeof conversationId === 'string') setActiveId(conversationId)
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
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        setVoiceBlob(blob)
        setSelectedFile(null)
        setRecording(false)
        stream.getTracks().forEach(track => track.stop())
        streamRef.current = null
        recorderRef.current = null
      }
      recorder.start()
      setRecording(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('cloud.error.startVoice'))
    }
  }

  function stopVoiceRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeId || !session || (!messageText.trim() && !selectedFile && !voiceBlob)) return
    setBusy(true); setError('')
    let uploadedPath: string | null = null
    let messageId: string | null = null
    const media = voiceBlob ?? selectedFile
    const mediaName = voiceBlob ? `voice-note-${Date.now()}.webm` : selectedFile?.name ?? ''
    const mediaType = voiceBlob ? 'voice' : selectedFile?.type.startsWith('image/') ? 'image' : 'file'
    try {
      const inserted = await cloudRest<{ id: string }[]>('messages?select=id', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ conversation_id: activeId, sender_id: session.user.id, content: messageText.trim(), message_type: media ? mediaType : 'text', reply_to_message_id: replyToMessageId }),
      })
      messageId = inserted[0]?.id ?? null
      if (!messageId) throw new Error('The database did not return the new message id')
      if (media) {
        const safeName = mediaName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'attachment'
        uploadedPath = `conversations/${activeId}/${session.user.id}/${messageId}-${safeName}`
        await cloudStorageUpload(uploadedPath, media)
        await cloudRest<void>('message_attachments', {
          method: 'POST',
          body: JSON.stringify({ message_id: messageId, conversation_id: activeId, storage_path: uploadedPath, file_name: mediaName, mime_type: media.type || 'application/octet-stream', file_size: media.size, duration_ms: null }),
        })
      }
      setMessageText(''); setReplyToMessageId(null); setSelectedFile(null); setVoiceBlob(null)
      realtimeRef.current?.broadcast('typing', { user_id: session.user.id, typing: false })
      await loadMessages()
      await loadData()
    } catch (cause) {
      if (uploadedPath) await cloudStorageRemove(uploadedPath).catch(() => {})
      if (messageId) await cloudRest<void>(`messages?id=eq.${messageId}`, { method: 'DELETE' }).catch(() => {})
      setError(cause instanceof Error ? cause.message : t('cloud.error.sendMessage'))
    } finally { setBusy(false) }
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
    setBusy(true); setError(''); setStatus('')
    try {
      await cloudRest<Profile[]>(`profiles?id=eq.${session.user.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ display_name: profileName.trim(), username: profileUsername.trim() || null, bio: profileBio.trim() || null }),
      })
      setProfileOpen(false)
      await loadData()
      setStatus(t('cloud.profile.saved'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('cloud.error.saveProfile'))
    } finally { setBusy(false) }
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!groupTitle.trim()) return
    setBusy(true); setError(''); setStatus('')
    try {
      const id = await cloudRest<string>('rpc/create_group_conversation', {
        method: 'POST',
        body: JSON.stringify({ p_title: groupTitle.trim(), p_member_ids: selectedGroupMembers }),
      })
      setGroupTitle(''); setSelectedGroupMembers([]); setGroupComposerOpen(false); setActiveId(id)
      await loadData()
      setStatus(t('cloud.members.groupCreated'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('cloud.error.createGroup'))
    } finally { setBusy(false) }
  }

  async function markStorySeen(storyId: string) {
    try {
      await cloudRest<void>('rpc/mark_story_view', { method: 'POST', body: JSON.stringify({ p_story_id: storyId }) })
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
    if (storyImage && storyImage.size > 10 * 1024 * 1024) { setError(t('cloud.error.storyImageSize')); return }
    setBusy(true); setError('')
    let storagePath: string | null = null
    try {
      const storyId = crypto.randomUUID()
      if (storyImage) {
        const safeName = storyImage.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'story-image'
        storagePath = `stories/${session.user.id}/${storyId}/${safeName}`
        await cloudStorageUpload(storagePath, storyImage)
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
      setError(cause instanceof Error ? cause.message : t('cloud.error.publishStory'))
    } finally { setBusy(false) }
  }

  if (!session) return <EmptyState icon={<Users />} title={t('cloud.auth.signInRequiredTitle')} description={t('cloud.auth.signInRequiredDescription')} />

  const activeConversation = conversations.find(item => item.id === activeId)

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3 sm:px-5">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t('chats.eyebrow')}</p><h2 className="mt-1 text-xl font-bold tracking-tight">{t('chats.title')}</h2><p className="text-xs text-muted-foreground">{profile?.display_name ?? session.user.email}</p></div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => setNotificationsOpen(value => !value)} aria-label={t('cloud.notifications.title')}><Bell data-icon="inline-start"/>{notifications.filter(item => !item.read_at).length || ''}</Button><Button variant="outline" onClick={() => setProfileOpen(value => !value)} disabled={busy}>{t('cloud.profile.edit')}</Button><Button variant="outline" onClick={() => { void loadData(); void loadMessages() }} disabled={busy}><RefreshCw data-icon="inline-start" />{t('cloud.refresh')}</Button></div>
      </header>
      {notificationsOpen ? <section className="rounded-xl border border-border bg-card p-3"><h3 className="mb-2 font-semibold">{t('cloud.notifications.title')}</h3>{notifications.length ? <div className="max-h-64 overflow-y-auto">{notifications.map(notification => <button key={notification.id} type="button" onClick={() => void openNotification(notification)} className={`mb-1 block w-full rounded-lg p-2 text-start text-sm hover:bg-secondary ${notification.read_at ? 'opacity-70' : 'bg-primary/5'}`}><span className="block font-medium">{notificationLabel(notification)}</span><span className="mt-1 block text-xs text-muted-foreground">{members.find(item => item.id === notification.actor_id)?.display_name ?? t('cloud.members.member')} · {new Date(notification.created_at).toLocaleTimeString(locale === 'ar' ? 'ar-EG' : 'en-US')}</span></button>)}</div> : <p className="text-sm text-muted-foreground">{t('cloud.notifications.empty')}</p>}</section> : null}
      {profileOpen ? <form onSubmit={saveProfile} className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3"><div className="grid gap-1"><Label htmlFor="profile-display-name">{t('cloud.profile.displayName')}</Label><Input id="profile-display-name" value={profileName} onChange={e => setProfileName(e.target.value)} required maxLength={80}/></div><div className="grid gap-1"><Label htmlFor="profile-username">{t('cloud.profile.username')}</Label><Input id="profile-username" value={profileUsername} onChange={e => setProfileUsername(e.target.value)} minLength={3} maxLength={24} placeholder={t('cloud.profile.username')}/></div><div className="grid gap-1"><Label htmlFor="profile-bio">{t('cloud.profile.bio')}</Label><Input id="profile-bio" value={profileBio} onChange={e => setProfileBio(e.target.value)} maxLength={160} placeholder={t('cloud.profile.bio')}/></div><Button type="submit" disabled={busy || !profileName.trim()}>{t('cloud.profile.save')}</Button></form> : null}

      {error ? <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      {status ? <p role="status" className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-muted-foreground">{status}</p> : null}

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-semibold">{t('cloud.stories.title')}</h3><p className="text-xs text-muted-foreground">{t('cloud.stories.publishedSubtitle')}</p></div><Button size="sm" variant="outline" onClick={() => setStoryComposer(value => !value)}><Plus data-icon="inline-start" />{t('cloud.stories.add')}</Button></div>
        {storyComposer ? <form onSubmit={publishTextStory} className="mb-3 grid gap-2"><Label htmlFor="cloud-story">{t('cloud.stories.textCaption')}</Label><Textarea id="cloud-story" value={storyText} onChange={e => setStoryText(e.target.value)} maxLength={500} placeholder={t('cloud.stories.placeholder')}/><Label htmlFor="cloud-story-image">{t('cloud.stories.image')}</Label><input id="cloud-story-image" type="file" accept="image/*" onChange={e => setStoryImage(e.target.files?.[0] ?? null)} className="text-xs"/>{storyImage ? <p className="text-xs text-muted-foreground">{storyImage.name} · <button type="button" onClick={() => setStoryImage(null)}>{t('cloud.stories.remove')}</button></p> : null}<fieldset className="grid gap-2 rounded-lg border border-border p-3"><legend className="px-1 text-xs font-semibold">{t('cloud.stories.audience')}</legend><label className="flex items-center gap-2 text-sm"><input type="radio" checked={storyAudience === 'community'} onChange={() => setStoryAudience('community')}/>{t('cloud.stories.community')}</label><label className="flex items-center gap-2 text-sm"><input type="radio" checked={storyAudience === 'selected-members'} onChange={() => setStoryAudience('selected-members')}/>{t('cloud.stories.selected')}</label>{storyAudience === 'selected-members' ? <div className="max-h-32 overflow-y-auto">{filteredMembers.map(member => <label key={member.id} className="flex items-center gap-2 py-1 text-xs"><input type="checkbox" checked={storyAudienceMemberIds.includes(member.id)} onChange={e => setStoryAudienceMemberIds(current => e.target.checked ? [...current, member.id] : current.filter(id => id !== member.id))}/><span>{member.display_name}</span></label>)}</div> : null}</fieldset><Button type="submit" disabled={busy || (!storyText.trim() && !storyImage) || (storyAudience === 'selected-members' && !storyAudienceMemberIds.length)}>{t('cloud.stories.publish')}</Button></form> : null}
        {stories.length ? <div className="flex gap-4 overflow-x-auto pb-2 pt-1">{stories.map(story => <button key={story.id} type="button" onClick={() => void openStory(story)} className="group flex w-[4.5rem] shrink-0 flex-col items-center gap-2 text-center"><span className="flex size-[4.35rem] items-center justify-center rounded-full bg-gradient-to-br from-primary via-primary/75 to-accent p-[3px] shadow-panel transition-transform group-hover:scale-[1.03]"><span className="flex size-full items-center justify-center overflow-hidden rounded-full border-2 border-card bg-secondary">{story.signed_url ? <img src={story.signed_url} alt="" className="size-full object-cover" loading="lazy"/> : <span className="flex size-full items-center justify-center bg-primary/10 text-primary"><CircleUserRound className="size-7"/></span>}</span></span><span className="w-full truncate text-xs font-medium">{members.find(item => item.id === story.owner_id)?.display_name ?? t('cloud.members.member')}</span></button>)}</div> : <p className="text-sm text-muted-foreground">{t('cloud.stories.noStories')}</p>}
      </section>

      <div className="grid min-h-[30rem] overflow-hidden rounded-xl border border-border bg-card md:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className={`${mobileThreadOpen ? 'hidden md:block' : 'block'} border-b border-border md:border-b-0 md:border-e`}>
          <div className="border-b border-border p-3"><div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">{t('cloud.conversations.title')}</h3><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setDirectoryOpen(value => !value)} aria-pressed={directoryOpen}><Users data-icon="inline-start"/>{t('cloud.members.title')}</Button><Button size="sm" variant="ghost" onClick={() => setGroupComposerOpen(value => !value)}><Plus data-icon="inline-start"/>{t('cloud.members.group')}</Button></div></div><div className={`${directoryOpen ? 'block' : 'hidden'} relative`}><Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input className="ps-9" value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder={t('cloud.members.search')}/></div>
            {groupComposerOpen ? <form onSubmit={createGroup} className="mt-3 grid gap-2 rounded-lg bg-secondary/50 p-2"><Label htmlFor="group-title">{t('cloud.members.groupName')}</Label><Input id="group-title" value={groupTitle} onChange={e => setGroupTitle(e.target.value)} maxLength={80} required placeholder={t('cloud.members.groupName')}/><div className="max-h-32 overflow-y-auto">{filteredMembers.map(member => <label key={member.id} className="flex items-center gap-2 py-1 text-xs"><input type="checkbox" checked={selectedGroupMembers.includes(member.id)} onChange={e => setSelectedGroupMembers(current => e.target.checked ? [...current, member.id] : current.filter(id => id !== member.id))}/><span className="truncate">{member.display_name}</span></label>)}</div><Button size="sm" type="submit" disabled={busy || !groupTitle.trim() || selectedGroupMembers.length === 0}>{t('cloud.members.createGroup')}</Button></form> : null}
          </div>
          <div className={`${directoryOpen ? 'block' : 'hidden'} max-h-72 overflow-y-auto p-2 md:max-h-[28rem]`}>{filteredMembers.map(member => <button key={member.id} type="button" onClick={() => void startDirect(member)} disabled={busy} className="flex w-full items-center gap-3 rounded-lg p-3 text-start hover:bg-secondary disabled:opacity-50"><Avatar name={member.display_name} size="md"/><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{member.display_name}</span><span className="block truncate text-xs text-muted-foreground">{member.username ? `@${member.username}` : member.bio ?? t('cloud.members.member')}</span></span><MessageCircle className="size-4 text-muted-foreground"/></button>)}{!filteredMembers.length ? <p className="p-3 text-xs text-muted-foreground">{t('cloud.members.noMembers')}</p> : null}</div>
          <div className="border-t border-border p-3"><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">{t('cloud.conversations.title')}</h3><span className="text-[11px] text-muted-foreground">{conversations.length}</span></div>{conversations.map(conversation => <button key={conversation.id} type="button" onClick={() => { setActiveId(conversation.id); setMobileThreadOpen(true) }} className={`mb-1 w-full rounded-xl p-3 text-start text-sm transition-colors hover:bg-secondary ${activeId === conversation.id ? 'bg-primary/10 ring-1 ring-primary/25' : ''}`}><span className="block truncate font-medium">{conversation.title ?? peerNames[conversation.id] ?? t('cloud.conversations.private')}</span><span className="block truncate text-xs text-muted-foreground">{conversationPreviews[conversation.id] || (conversation.kind === 'group' ? t('cloud.members.group') : t('cloud.conversations.private'))}</span><span className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground"><span>{conversation.kind === 'group' ? t('cloud.members.group') : t('cloud.conversations.private')}</span>{unreadCounts[conversation.id] ? <span className="rounded-full bg-primary px-1.5 py-0.5 font-semibold text-primary-foreground">{unreadCounts[conversation.id]}</span> : null}</span></button>)}</div>
        </aside>
        <section className={`${mobileThreadOpen ? 'flex' : 'hidden md:flex'} min-h-[25rem] min-w-0 flex-col bg-background/30`}>
          {activeConversation ? <><header className="flex items-center gap-3 border-b border-border p-3 sm:p-4"><Button type="button" size="icon" variant="ghost" className="size-9 shrink-0 rounded-xl md:hidden" aria-label={t('chats.backToChats')} onClick={() => setMobileThreadOpen(false)}><ArrowLeft className="rtl:-scale-x-100"/></Button><div className="min-w-0 flex-1"><h3 className="truncate font-semibold">{activeConversation.title ?? peerNames[activeConversation.id] ?? t('cloud.conversations.private')}</h3><p className="text-xs text-muted-foreground">{realtimeConnected ? t('cloud.realtime.connected') : t('cloud.realtime.polling')} · {onlineUserIds.length} {t('cloud.realtime.online')}</p></div>{activeConversation.kind === 'group' ? <Button size="sm" variant="outline" onClick={() => setManageGroupOpen(value => !value)}>{t('cloud.group.manageMembers')}</Button> : null}</header>
          {manageGroupOpen && activeConversation.kind === 'group' ? <section className="border-b border-border bg-card p-3"><h4 className="mb-2 text-sm font-semibold">{t('cloud.group.manageMembers')}</h4><div className="mb-3 grid gap-1">{(conversationMembers[activeId] ?? []).map(member => <div key={member.user_id} className="flex items-center justify-between gap-2 rounded-md bg-secondary/50 px-2 py-1.5 text-xs"><span className="truncate">{members.find(item => item.id === member.user_id)?.display_name ?? (member.user_id === session.user.id ? profile?.display_name : t('cloud.members.member'))} · {t(member.role === 'owner' ? 'cloud.group.owner' : member.role === 'admin' ? 'cloud.group.admin' : 'cloud.group.member')}</span>{member.user_id === session.user.id || ['owner','admin'].includes(conversationMembers[activeId]?.find(item => item.user_id === session.user.id)?.role ?? '') ? <Button size="sm" variant="ghost" onClick={() => void removeGroupMember(member.user_id)} disabled={busy}>{member.user_id === session.user.id ? t('cloud.group.leave') : t('cloud.group.removeMember')}</Button> : null}</div>)}</div><form onSubmit={addGroupMembers} className="grid gap-2"><h5 className="text-xs font-semibold">{t('cloud.group.addMembers')}</h5><div className="max-h-32 overflow-y-auto">{filteredMembers.filter(member => !(conversationMembers[activeId] ?? []).some(current => current.user_id === member.id)).map(member => <label key={member.id} className="flex items-center gap-2 py-1 text-xs"><input type="checkbox" checked={groupAddMemberIds.includes(member.id)} onChange={e => setGroupAddMemberIds(current => e.target.checked ? [...current, member.id] : current.filter(id => id !== member.id))}/><span>{member.display_name}</span></label>)}</div><Button size="sm" type="submit" disabled={busy || !groupAddMemberIds.length}>{t('cloud.group.addMembers')}</Button></form></section> : null}<div className="flex-1 space-y-3 overflow-y-auto p-4" role="log" aria-live="polite">{messages.map(message => <article key={message.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${message.sender_id === session.user.id ? 'ms-auto bg-primary/15' : 'bg-secondary'}`}>
            {message.reply_to_message_id ? <p className="mb-2 rounded-md border-s-2 border-primary/60 px-2 py-1 text-xs text-muted-foreground">{messages.find(item => item.id === message.reply_to_message_id)?.content ?? 'Reply to message'}</p> : null}
            {editingMessageId === message.id ? <div className="grid gap-2"><Textarea value={editingText} onChange={e => setEditingText(e.target.value)} maxLength={10000}/><div className="flex gap-1"><Button size="sm" onClick={() => void editMessage(message.id)} disabled={!editingText.trim()}>{t('cloud.messages.saveEdit')}</Button><Button size="sm" variant="ghost" onClick={() => setEditingMessageId(null)}>{t('cloud.messages.cancel')}</Button></div></div> : <p dir="auto">{message.deleted_for_everyone ? t('cloud.messages.deleted') : message.content}</p>}
            {(messageAttachments[message.id] ?? []).map(attachment => attachment.mime_type.startsWith('image/') ? <a key={attachment.id} href={attachment.signed_url} target="_blank" rel="noreferrer" className="mt-2 block"><img src={attachment.signed_url} alt={attachment.file_name} className="max-h-64 max-w-full rounded-lg object-contain" loading="lazy"/></a> : attachment.mime_type.startsWith('audio/') || attachment.mime_type.startsWith('video/') ? <audio key={attachment.id} controls preload="metadata" src={attachment.signed_url} className="mt-2 max-w-full"/> : <a key={attachment.id} href={attachment.signed_url} download={attachment.file_name} className="mt-2 block truncate text-xs underline">{attachment.file_name} · {Math.ceil(attachment.file_size / 1024)} KB</a>)}
            <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">{message.pinned_at ? '📌 ' : ''}{message.edited_at ? t('cloud.messages.edited') + ' · ' : ''}{new Date(message.created_at).toLocaleTimeString(locale === 'ar' ? 'ar-EG' : 'en-US')}{message.sender_id === session.user.id ? <span aria-label={messageReceiptStatus[message.id] ?? 'sent'} className={messageReceiptStatus[message.id] === 'read' ? 'text-primary' : ''}>{messageReceiptStatus[message.id] === 'read' ? '✓✓' : messageReceiptStatus[message.id] === 'delivered' ? '✓' : '·'}</span> : null}</p>
            <div className="mt-1 flex flex-wrap items-center justify-end gap-1">
              <button type="button" className="rounded px-1.5 py-0.5 text-[11px] hover:bg-background/60" onClick={() => setReplyToMessageId(message.id)}>{t('cloud.messages.reply')}</button>
              <button type="button" aria-pressed={(messageReactions[message.id] ?? []).includes('❤️')} className="rounded px-1.5 py-0.5 text-[11px] hover:bg-background/60" onClick={() => void toggleMessageReaction(message.id, '❤️')}>❤️ {(messageReactions[message.id] ?? []).filter(value => value === '❤️').length || ''}</button>
              <button type="button" aria-pressed={(messageReactions[message.id] ?? []).includes('👍')} className="rounded px-1.5 py-0.5 text-[11px] hover:bg-background/60" onClick={() => void toggleMessageReaction(message.id, '👍')}>👍 {(messageReactions[message.id] ?? []).filter(value => value === '👍').length || ''}</button>
              {message.sender_id === session.user.id && !message.deleted_for_everyone ? <><button type="button" className="rounded px-1.5 py-0.5 text-[11px] hover:bg-background/60" onClick={() => { setEditingMessageId(message.id); setEditingText(message.content) }}>{t('cloud.messages.edit')}</button><button type="button" className="rounded px-1.5 py-0.5 text-[11px] hover:bg-background/60" onClick={() => void deleteMessage(message.id)}>{t('cloud.messages.delete')}</button></> : null}
              <button type="button" className="rounded px-1.5 py-0.5 text-[11px] hover:bg-background/60" onClick={() => void pinMessage(message.id, !message.pinned_at)}>{message.pinned_at ? t('cloud.messages.unpin') : t('cloud.messages.pin')}</button>
              <button type="button" className="rounded px-1.5 py-0.5 text-[11px] hover:bg-background/60" onClick={() => { setForwardingMessageId(forwardingMessageId === message.id ? null : message.id); setForwardTargetId('') }}>{t('cloud.messages.forward')}</button>
            </div>
            {forwardingMessageId === message.id ? <div className="mt-2 flex gap-2"><select aria-label="Forward to conversation" value={forwardTargetId} onChange={e => setForwardTargetId(e.target.value)} className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs"><option value="">{t('cloud.conversations.chooseOption')}</option>{conversations.filter(item => item.id !== activeId).map(item => <option key={item.id} value={item.id}>{item.title ?? peerNames[item.id] ?? t('cloud.conversations.private')}</option>)}</select><Button size="sm" onClick={() => void forwardMessage(message)} disabled={!forwardTargetId}>{t('cloud.messages.forward')}</Button></div> : null}
          </article>)}{!messages.length ? <p className="text-sm text-muted-foreground">{t('cloud.messages.empty')}</p> : null}</div>{typingUserId ? <p className="px-4 py-2 text-xs text-muted-foreground">{members.find(item => item.id === typingUserId)?.display_name ?? t('cloud.members.member')} {t('cloud.messages.typing')}</p> : null}<form onSubmit={sendMessage} className="flex flex-col gap-2 border-t border-border p-3">{replyToMessageId ? <div className="flex items-center justify-between rounded-md bg-secondary px-2 py-1 text-xs"><span className="truncate">{t('chats.message.replying')}: {messages.find(item => item.id === replyToMessageId)?.content ?? 'message'}</span><button type="button" onClick={() => setReplyToMessageId(null)}>{t('cloud.messages.cancel')}</button></div> : null}{selectedFile ? <p className="text-xs text-muted-foreground">{t('cloud.messages.attachmentLabel')}: {selectedFile.name} · <button type="button" onClick={() => setSelectedFile(null)}>{t('cloud.stories.remove')}</button></p> : null}{voiceBlob ? <p className="text-xs text-muted-foreground">{t('cloud.messages.voiceReadyLabel')} · <button type="button" onClick={() => setVoiceBlob(null)}>{t('cloud.stories.remove')}</button></p> : null}<div className="flex gap-2"><input type="file" className="hidden" id="cloud-chat-file" accept="image/*,application/pdf,text/plain" onChange={e => { setSelectedFile(e.target.files?.[0] ?? null); setVoiceBlob(null) }}/><Button type="button" size="sm" className="size-9 p-0" variant="outline" aria-label={t('cloud.messages.attach')} onClick={() => document.getElementById('cloud-chat-file')?.click()}><Paperclip/></Button><Button type="button" size="sm" className="size-9 p-0" variant={recording ? 'danger' : 'outline'} aria-label={recording ? t('cloud.messages.stopVoice') : t('cloud.messages.voice')} onClick={() => recording ? stopVoiceRecording() : void startVoiceRecording()}>{recording ? <Square/> : <Mic/>}</Button><Input value={messageText} onChange={e => { setMessageText(e.target.value); realtimeRef.current?.broadcast('typing', { user_id: session.user.id, typing: true }) }} placeholder={t('cloud.messages.write')} aria-label={t('cloud.messages.write')} /><Button type="submit" disabled={busy || (!messageText.trim() && !selectedFile && !voiceBlob)}><Send data-icon="inline-start"/>{t('cloud.messages.send')}</Button></div></form></> : <div className="flex flex-1 items-center justify-center p-6 text-center"><EmptyState icon={<BookOpen/>} title={t('cloud.conversations.choose')} description={t('cloud.conversations.chooseDescription')}/></div>}
        </section>
      </div>
      <Dialog open={activeStory !== null} onOpenChange={open => { if (!open) { setActiveStory(null); setStoryViewers([]) } }}>
        <DialogContent className="max-w-lg">
          <DialogTitle>{t('cloud.stories.viewerTitle')}</DialogTitle>
          <DialogDescription>{activeStory ? new Date(activeStory.expires_at).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US') : ''}</DialogDescription>
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
