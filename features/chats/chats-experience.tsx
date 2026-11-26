'use client'

import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  ArrowLeft,
  CircleUserRound,
  FileUp,
  Heart,
  ImagePlus,
  MessageCircle,
  Mic,
  Plus,
  Search,
  SendHorizontal,
  ThumbsUp,
  UsersRound,
  X,
} from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { IconButton } from '@/components/ui/icon-button'
import { Input, Label, Textarea } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/states'
import { usePreferences } from '@/components/providers/preferences-provider'
import { localChatsRepository } from '@/lib/chats/local-repository'
import {
  LOCAL_NOTES_CONVERSATION_ID,
  LOCAL_NOTES_SENDER_ID,
  type ChatMessage,
  type StoryAudience,
  type StoryDraft,
} from '@/lib/chats/types'

const LOCAL_NOTICE_KEY = 'chats.localNotice'
const SEARCH_SCOPES = ['conversations', 'messages', 'members'] as const

type SearchScope = (typeof SEARCH_SCOPES)[number]
type ActiveView = 'inbox' | 'notes' | 'members'

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
}

function formatTime(timestamp: number, locale: string) {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(timestamp)
}

function formatDate(timestamp: number, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(timestamp)
}

function MessageBubble({
  message,
  reply,
  locale,
  onReply,
  onReact,
  highlighted,
  replyLabel,
  heartLabel,
  heartRemoveLabel,
  likeLabel,
  likeRemoveLabel,
}: {
  message: ChatMessage
  reply?: ChatMessage
  locale: string
  onReply: () => void
  onReact: (emoji: string) => void
  highlighted: boolean
  replyLabel: string
  heartLabel: string
  heartRemoveLabel: string
  likeLabel: string
  likeRemoveLabel: string
}) {
  const liked = message.reactions.some((reaction) => reaction.memberId === LOCAL_NOTES_SENDER_ID && reaction.emoji === 'heart')
  const appreciated = message.reactions.some(
    (reaction) => reaction.memberId === LOCAL_NOTES_SENDER_ID && reaction.emoji === 'like',
  )

  return (
    <li
      id={`message-${message.id}`}
      className={`flex justify-end transition-colors ${highlighted ? 'rounded-2xl bg-accent/10' : ''}`}
    >
      <article className="max-w-[88%] sm:max-w-[75%]">
        <div className="rounded-2xl rounded-ee-sm bg-primary/15 px-4 py-3 text-sm leading-relaxed">
          {reply ? (
            <div className="mb-2 rounded-lg border-s-2 border-primary/60 bg-background/50 px-3 py-2 text-xs text-muted-foreground">
              <span className="mb-0.5 block font-semibold text-foreground">{replyLabel}</span>
              <span className="line-clamp-2">{reply.text}</span>
            </div>
          ) : null}
          <p className="whitespace-pre-wrap break-words" dir="auto">{message.text}</p>
          <div className="mt-2 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
            <span>{formatTime(message.createdAt, locale)}</span>
          </div>
        </div>
        <div className="mt-1 flex items-center justify-end gap-1">
          {liked ? <span className="rounded-full border border-border bg-card px-2 py-0.5 text-xs">♥</span> : null}
          {appreciated ? <span className="rounded-full border border-border bg-card px-2 py-0.5 text-xs">+1</span> : null}
          <button
            type="button"
            onClick={onReply}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {replyLabel}
          </button>
          <IconButton
            label={liked ? heartRemoveLabel : heartLabel}
            size="sm"
            aria-pressed={liked}
            onClick={() => onReact('heart')}
          >
            <Heart className={liked ? 'fill-current text-danger' : ''} />
          </IconButton>
          <IconButton
            label={appreciated ? likeRemoveLabel : likeLabel}
            size="sm"
            aria-pressed={appreciated}
            onClick={() => onReact('like')}
          >
            <ThumbsUp className={appreciated ? 'text-primary' : ''} />
          </IconButton>
        </div>
      </article>
    </li>
  )
}

export function ChatsExperience({ initialView = 'inbox' }: { initialView?: ActiveView } = {}) {
  const { t, locale } = usePreferences()
  const dateLocale = locale === 'ar' ? 'ar-EG' : 'en-US'
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [storyDrafts, setStoryDrafts] = useState<StoryDraft[]>([])
  const [ready, setReady] = useState(false)
  const [storageError, setStorageError] = useState(false)
  const [activeView, setActiveView] = useState<ActiveView>(initialView)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchScope, setSearchScope] = useState<SearchScope>('conversations')
  const [searchQuery, setSearchQuery] = useState('')
  const [memberQuery, setMemberQuery] = useState('')
  const [messageText, setMessageText] = useState('')
  const [replyToId, setReplyToId] = useState<string | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [storyDialogOpen, setStoryDialogOpen] = useState(false)
  const [storyText, setStoryText] = useState('')
  const [storyAudience, setStoryAudience] = useState<StoryAudience>('community')
  const [storyPreview, setStoryPreview] = useState<StoryDraft | null>(null)
  const [localStatus, setLocalStatus] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([localChatsRepository.listPrivateNotes(), localChatsRepository.listStoryDrafts()])
      .then(([savedMessages, savedDrafts]) => {
        setMessages(savedMessages)
        setStoryDrafts(savedDrafts)
        setReady(true)
      })
      .catch(() => {
        setStorageError(true)
        setReady(true)
      })

    return localChatsRepository.subscribe(() => {
      Promise.all([localChatsRepository.listPrivateNotes(), localChatsRepository.listStoryDrafts()])
        .then(([savedMessages, savedDrafts]) => {
          setMessages(savedMessages)
          setStoryDrafts(savedDrafts)
        })
        .catch(() => setStorageError(true))
    })
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [messages, activeView])

  const filteredNotes = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase()
    if (!query) return messages
    return messages.filter((message) => message.text.toLocaleLowerCase().includes(query))
  }, [messages, searchQuery])

  const replyTo = messages.find((message) => message.id === replyToId)
  const latestDraft = storyDrafts[0]

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = messageText.trim()
    if (!text || !ready) return

    const message: ChatMessage = {
      id: newId(),
      conversationId: LOCAL_NOTES_CONVERSATION_ID,
      senderId: LOCAL_NOTES_SENDER_ID,
      text,
      createdAt: Date.now(),
      replyToMessageId: replyToId,
      reactions: [],
      attachments: [],
    }

    try {
      await localChatsRepository.savePrivateNote(message)
      setMessages((current) => [...current, message])
      setMessageText('')
      setReplyToId(null)
      setLocalStatus(t('chats.notes.saved'))
    } catch {
      setStorageError(true)
      setLocalStatus(t('chats.storage.error'))
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  async function toggleReaction(message: ChatMessage, emoji: string) {
    const hasReaction = message.reactions.some(
      (reaction) => reaction.memberId === LOCAL_NOTES_SENDER_ID && reaction.emoji === emoji,
    )
    const updated: ChatMessage = {
      ...message,
      reactions: hasReaction
        ? message.reactions.filter((reaction) => !(reaction.memberId === LOCAL_NOTES_SENDER_ID && reaction.emoji === emoji))
        : [...message.reactions, { emoji, memberId: LOCAL_NOTES_SENDER_ID }],
    }
    try {
      await localChatsRepository.savePrivateNote(updated)
      setMessages((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    } catch {
      setStorageError(true)
      setLocalStatus(t('chats.storage.error'))
    }
  }

  async function saveStoryDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = storyText.trim()
    if (!text) return
    const draft: StoryDraft = {
      id: newId(),
      text,
      createdAt: Date.now(),
      audience: storyAudience,
      audienceMemberIds: [],
      status: 'draft',
    }
    try {
      await localChatsRepository.saveStoryDraft(draft)
      setStoryDrafts((current) => [draft, ...current])
      setStoryDialogOpen(false)
      setStoryText('')
      setStoryPreview(draft)
      setLocalStatus(t('chats.stories.draftSaved'))
    } catch {
      setStorageError(true)
      setLocalStatus(t('chats.storage.error'))
    }
  }

  const openNotes = () => {
    setActiveView('notes')
    setSearchOpen(false)
  }

  const showInbox = () => setActiveView('inbox')

  return (
    <div className={`flex flex-col gap-4 ${activeView === 'inbox' ? 'min-h-[calc(100dvh-16rem)] md:min-h-[calc(100dvh-13rem)]' : 'min-h-[calc(100dvh-10rem)] md:min-h-[calc(100dvh-13rem)]'}`}>
      <header className={`${activeView === 'inbox' ? 'flex' : 'hidden md:flex'} items-center justify-between gap-4`}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t('chats.eyebrow')}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{t('chats.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('chats.description')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <IconButton
            label={searchOpen ? t('chats.search.close') : t('chats.search.open')}
            variant={searchOpen ? 'secondary' : 'ghost'}
            onClick={() => setSearchOpen((open) => !open)}
          >
            {searchOpen ? <X /> : <Search />}
          </IconButton>
          <IconButton label={t('chats.members.open')} variant="primary" onClick={() => setActiveView('members')}>
            <Plus />
          </IconButton>
        </div>
      </header>

      {searchOpen ? (
        <section aria-label={t('chats.search.title')} className="rounded-xl border border-border bg-card p-3 sm:p-4">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('chats.search.title')}>
            {SEARCH_SCOPES.map((scope) => (
              <button
                key={scope}
                type="button"
                role="tab"
                aria-selected={searchScope === scope}
                onClick={() => setSearchScope(scope)}
                className={`rounded-full px-3 py-1.5 text-sm transition-colors ${searchScope === scope ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/70'}`}
              >
                {t(`chats.search.${scope}`)}
              </button>
            ))}
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              autoFocus
              type="search"
              value={searchScope === 'members' ? memberQuery : searchQuery}
              onChange={(event) =>
                searchScope === 'members' ? setMemberQuery(event.target.value) : setSearchQuery(event.target.value)
              }
              placeholder={t(`chats.search.placeholder.${searchScope}`)}
              aria-label={t(`chats.search.placeholder.${searchScope}`)}
              className="ps-9"
            />
          </div>
          {searchScope === 'messages' ? (
            <div className="mt-3">
              {filteredNotes.length > 0 ? (
                <ul className="divide-y divide-border">
                  {filteredNotes.map((message) => (
                    <li key={message.id}>
                      <button
                        type="button"
                        onClick={() => {
                          openNotes()
                          setHighlightId(message.id)
                          window.setTimeout(() => document.getElementById(`message-${message.id}`)?.scrollIntoView({ block: 'center' }), 100)
                        }}
                        className="w-full rounded-lg px-2 py-3 text-start transition-colors hover:bg-secondary"
                      >
                        <span className="block truncate text-sm">{message.text}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">{t('chats.notes.title')} · {formatDate(message.createdAt, dateLocale)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-3 text-sm text-muted-foreground">{t('chats.search.noMessages')}</p>
              )}
            </div>
          ) : null}
          {searchScope === 'conversations' ? (
            <p className="mt-3 text-sm text-muted-foreground">{t('chats.search.noConversations')}</p>
          ) : null}
          {searchScope === 'members' ? (
            <p className="mt-3 text-sm text-muted-foreground">{t('chats.members.unavailable')}</p>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="stories-heading" className={`${activeView === 'inbox' ? 'block' : 'hidden md:block'} rounded-xl border border-border bg-card px-4 py-4 shadow-panel sm:px-5`}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 id="stories-heading" className="font-semibold">{t('chats.stories.title')}</h2>
            <p className="text-xs text-muted-foreground">{t('chats.stories.subtitle')}</p>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground sm:inline-flex">
            <UsersRound className="size-3.5" aria-hidden="true" />
            {t('chats.stories.communityOnly')}
          </span>
        </div>
        <div className="flex items-start gap-5 overflow-x-auto pb-1 scrollbar-thin">
          <button
            type="button"
            onClick={() => setStoryDialogOpen(true)}
            className="group flex w-16 shrink-0 flex-col items-center gap-1.5 text-center"
          >
            <span className="relative flex size-14 items-center justify-center rounded-full border-2 border-dashed border-primary/70 bg-primary/10 transition-colors group-hover:bg-primary/20">
              <Avatar name={t('chats.stories.you')} size="md" className="size-11 bg-transparent text-primary" />
              <span className="absolute -bottom-0.5 -end-0.5 flex size-5 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground">
                <Plus className="size-3" aria-hidden="true" />
              </span>
            </span>
            <span className="text-xs font-medium">{t('chats.stories.add')}</span>
          </button>
          {latestDraft ? (
            <button
              type="button"
              onClick={() => setStoryPreview(latestDraft)}
              className="group flex w-16 shrink-0 flex-col items-center gap-1.5 text-center"
            >
              <span className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-warning bg-warning/10 transition-colors group-hover:bg-warning/20">
                <CircleUserRound className="size-6 text-warning" aria-hidden="true" />
              </span>
              <span className="text-xs font-medium">{t('chats.stories.draft')}</span>
            </button>
          ) : null}
          <div className="flex min-h-16 min-w-48 items-center border-s border-border ps-4 text-xs leading-relaxed text-muted-foreground">
            {t('chats.stories.unavailable')}
          </div>
        </div>
      </section>

      {storageError ? (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
          {t('chats.storage.error')}
        </p>
      ) : null}
      {localStatus ? (
        <p aria-live="polite" className={`-mt-2 text-xs text-muted-foreground ${activeView === 'inbox' ? '' : 'hidden md:block'}`}>{localStatus}</p>
      ) : null}

      <div className={activeView === 'notes' ? 'fixed inset-x-0 top-14 bottom-[4.25rem] z-20 m-0 grid min-h-0 grid-cols-1 overflow-hidden rounded-none border-x-0 border-b-0 bg-card shadow-none md:static md:min-h-[27rem] md:grid-cols-[minmax(17rem,0.82fr)_minmax(0,1.55fr)] md:rounded-xl md:border md:shadow-panel' : 'grid min-h-[27rem] flex-1 grid-cols-1 overflow-hidden rounded-xl border border-border bg-card shadow-panel md:grid-cols-[minmax(17rem,0.82fr)_minmax(0,1.55fr)]'}>
        <section
          aria-label={t('chats.list.title')}
          className={`${activeView === 'notes' ? 'hidden md:flex' : 'flex'} min-w-0 flex-col border-border md:border-e`}
        >
          {activeView === 'members' ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center gap-2 border-b border-border p-4">
                <IconButton label={t('chats.members.back')} onClick={showInbox}>
                  <ArrowLeft className="rtl:-scale-x-100" />
                </IconButton>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">{t('chats.members.title')}</h2>
                  <p className="text-xs text-muted-foreground">{t('chats.members.subtitle')}</p>
                </div>
              </div>
              <div className="border-b border-border p-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    type="search"
                    value={memberQuery}
                    onChange={(event) => setMemberQuery(event.target.value)}
                    placeholder={t('chats.members.search')}
                    aria-label={t('chats.members.search')}
                    className="ps-9"
                  />
                </div>
              </div>
              <div className="flex flex-1 items-center justify-center p-4">
                <EmptyState
                  icon={<UsersRound />}
                  title={t('chats.members.unavailableTitle')}
                  description={t('chats.members.unavailable')}
                  className="py-6"
                />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-border p-4">
                <div>
                  <h2 className="font-semibold">{t('chats.list.title')}</h2>
                  <p className="text-xs text-muted-foreground">{t('chats.list.subtitle')}</p>
                </div>
                <IconButton label={t('chats.members.open')} onClick={() => setActiveView('members')}>
                  <UsersRound />
                </IconButton>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <EmptyState
                  icon={<MessageCircle />}
                  title={t('chats.list.empty')}
                  description={t('chats.list.emptyDescription')}
                  action={
                    <Button variant="outline" size="sm" onClick={() => setActiveView('members')}>
                      <UsersRound data-icon="inline-start" />
                      {t('chats.members.open')}
                    </Button>
                  }
                  className="py-7"
                />
                <div className="mt-2 border-t border-border pt-3">
                  <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {t('chats.local.title')}
                  </p>
                  <button
                    type="button"
                    onClick={openNotes}
                    className="flex w-full items-center gap-3 rounded-xl p-3 text-start transition-colors hover:bg-secondary"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <MessageCircle className="size-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{t('chats.notes.title')}</span>
                      <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                        {messages.at(-1)?.text ?? t('chats.notes.preview')}
                      </span>
                    </span>
                    <span className="text-[11px] text-muted-foreground">{messages.at(-1) ? formatTime(messages.at(-1)!.createdAt, dateLocale) : ''}</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        <section
          aria-label={t('chats.thread.title')}
          className={`${activeView === 'inbox' ? 'hidden md:flex' : 'flex'} min-h-0 min-w-0 flex-col bg-background/30`}
        >
          {activeView === 'members' ? (
            <div className="hidden h-full items-center justify-center p-6 text-center md:flex">
              <EmptyState icon={<UsersRound />} title={t('chats.members.selectTitle')} description={t('chats.members.selectDescription')} />
            </div>
          ) : activeView === 'notes' ? (
            <>
              <div className="flex items-center gap-3 border-b border-border bg-card px-3 py-3 sm:px-5">
                <IconButton label={t('chats.backToChats')} className="md:hidden" onClick={showInbox}>
                  <ArrowLeft className="rtl:-scale-x-100" />
                </IconButton>
                <Avatar name={t('chats.notes.title')} size="md" />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-semibold">{t('chats.notes.title')}</h2>
                  <p className="truncate text-xs text-muted-foreground">{t('chats.notes.localOnly')}</p>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5" role="log" aria-live="polite" aria-relevant="additions text">
                {messages.length === 0 ? (
                  <EmptyState
                    icon={<MessageCircle />}
                    title={t('chats.notes.emptyTitle')}
                    description={t('chats.notes.emptyDescription')}
                    className="min-h-56"
                  />
                ) : (
                  <ol className="flex flex-col gap-4">
                    {messages.map((message, index) => {
                      const previous = messages[index - 1]
                      const showDate = !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString()
                      const reply = messages.find((item) => item.id === message.replyToMessageId)
                      return (
                        <Fragment key={message.id}>
                          {showDate ? (
                            <li className="my-3 flex justify-center">
                              <span className="rounded-full bg-secondary px-3 py-1 text-[11px] text-muted-foreground">
                                {formatDate(message.createdAt, dateLocale)}
                              </span>
                            </li>
                          ) : null}
                          <MessageBubble
                            message={message}
                            reply={reply}
                            locale={dateLocale}
                            replyLabel={t('chats.message.reply')}
                            heartLabel={t('chats.reaction.heart')}
                            heartRemoveLabel={t('chats.reaction.heartRemove')}
                            likeLabel={t('chats.reaction.like')}
                            likeRemoveLabel={t('chats.reaction.likeRemove')}
                            highlighted={highlightId === message.id}
                            onReply={() => setReplyToId(message.id)}
                            onReact={(emoji) => void toggleReaction(message, emoji)}
                          />
                        </Fragment>
                      )
                    })}
                  </ol>
                )}
                <div ref={messagesEndRef} />
              </div>
              <div className="border-t border-border bg-card px-3 pb-safe py-3 sm:px-5">
                {replyTo ? (
                  <div className="mb-2 flex items-center gap-2 rounded-lg border-s-2 border-primary bg-secondary/70 px-3 py-2 text-xs">
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      <span className="font-semibold text-foreground">{t('chats.message.replying')}</span> {replyTo.text}
                    </span>
                    <IconButton label={t('common.close')} size="sm" onClick={() => setReplyToId(null)}><X /></IconButton>
                  </div>
                ) : null}
                <form onSubmit={(event) => void sendMessage(event)} className="flex items-end gap-2">
                  <div className="hidden gap-1 sm:flex">
                    <IconButton label={t('chats.images.unavailable')} disabled><ImagePlus /></IconButton>
                    <IconButton label={t('chats.attachments.unavailable')} disabled><FileUp /></IconButton>
                    <IconButton label={t('chats.voice.unavailable')} disabled><Mic /></IconButton>
                  </div>
                  <Label htmlFor="chat-composer" className="sr-only">{t('chats.composer.placeholder')}</Label>
                  <Textarea
                    id="chat-composer"
                    value={messageText}
                    onChange={(event) => setMessageText(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    placeholder={t('chats.notes.composerHint')}
                    aria-label={t('chats.composer.placeholder')}
                    disabled={!ready}
                    rows={1}
                    className="min-h-11 max-h-32 resize-y bg-surface py-2.5"
                  />
                  <IconButton
                    type="submit"
                    label={t('chats.composer.send')}
                    variant="primary"
                    disabled={!ready || !messageText.trim()}
                  >
                    <SendHorizontal className="rtl:-scale-x-100" />
                  </IconButton>
                </form>
                <p className="mt-2 text-center text-[11px] text-muted-foreground">{t(LOCAL_NOTICE_KEY)}</p>
              </div>
            </>
          ) : (
            <div className="flex h-full min-h-80 flex-col items-center justify-center p-6 text-center">
              <EmptyState
                icon={<MessageCircle />}
                title={t('chats.thread.title')}
                description={t('chats.thread.description')}
                className="py-6"
              />
              <Button variant="outline" onClick={openNotes}>
                <MessageCircle data-icon="inline-start" />
                {t('chats.notes.open')}
              </Button>
            </div>
          )}
        </section>
      </div>

      <Dialog open={storyDialogOpen} onOpenChange={setStoryDialogOpen}>
        <DialogContent>
          <DialogTitle>{t('chats.stories.createTitle')}</DialogTitle>
          <DialogDescription>{t('chats.stories.createDescription')}</DialogDescription>
          <form onSubmit={(event) => void saveStoryDraft(event)} className="mt-5 flex flex-col gap-4">
            <div>
              <Label htmlFor="story-text">{t('chats.stories.textLabel')}</Label>
              <Textarea
                id="story-text"
                value={storyText}
                onChange={(event) => setStoryText(event.target.value)}
                maxLength={500}
                placeholder={t('chats.stories.textPlaceholder')}
                className="min-h-28"
                required
              />
              <p className="mt-1 text-end text-xs text-muted-foreground">{storyText.length}/500</p>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">{t('chats.stories.audienceLabel')}</legend>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
                <input
                  type="radio"
                  name="story-audience"
                  value="community"
                  checked={storyAudience === 'community'}
                  onChange={() => setStoryAudience('community')}
                  className="mt-1 accent-primary"
                />
                <span>
                  <span className="block text-sm font-medium">{t('chats.stories.audienceCommunity')}</span>
                  <span className="block text-xs text-muted-foreground">{t('chats.stories.audienceCommunityHint')}</span>
                </span>
              </label>
              <label className="flex cursor-not-allowed items-start gap-3 rounded-lg border border-border bg-secondary/40 p-3 opacity-60">
                <input type="radio" name="story-audience" value="selected-members" disabled className="mt-1 accent-primary" />
                <span>
                  <span className="block text-sm font-medium">{t('chats.stories.audienceSelected')}</span>
                  <span className="block text-xs text-muted-foreground">{t('chats.stories.audienceSelectedHint')}</span>
                </span>
              </label>
            </fieldset>
            <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs leading-relaxed text-muted-foreground">{t('chats.stories.draftNotice')}</p>
            <Button type="submit" disabled={!storyText.trim()}>
              <Plus data-icon="inline-start" />
              {t('chats.stories.saveDraft')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={storyPreview !== null} onOpenChange={(open) => !open && setStoryPreview(null)}>
        <DialogContent className="overflow-hidden bg-elevated p-0">
          <div className="h-1.5 bg-warning/70" />
          <div className="p-5 pt-6">
            <DialogTitle>{t('chats.stories.previewTitle')}</DialogTitle>
            <DialogDescription>{t('chats.stories.previewSubtitle')}</DialogDescription>
            {storyPreview ? (
              <div className="mt-5 flex min-h-52 flex-col justify-between rounded-xl bg-background p-5">
                <div className="flex items-center gap-3">
                  <Avatar name={t('chats.stories.you')} size="sm" />
                  <div>
                    <p className="text-sm font-semibold">{t('chats.stories.you')}</p>
                    <p className="text-xs text-muted-foreground">{t('chats.stories.draft')} · {formatTime(storyPreview.createdAt, dateLocale)}</p>
                  </div>
                </div>
                <p className="my-8 whitespace-pre-wrap break-words text-lg font-medium" dir="auto">{storyPreview.text}</p>
                <p className="text-xs text-muted-foreground">{t('chats.stories.audienceCommunity')}</p>
              </div>
            ) : null}
            <p className="mt-3 text-xs text-muted-foreground">{t('chats.stories.draftNotice')}</p>
            <Button variant="outline" className="mt-4 w-full" onClick={() => setStoryPreview(null)}>
              {t('common.close')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
