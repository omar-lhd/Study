'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  Bell,
  Bookmark,
  Camera,
  ChevronRight,
  CircleHelp,
  MessageCircle,
  Plus,
  Search,
  Sparkles,
  UsersRound,
  X,
} from 'lucide-react'
import { usePreferences } from '@/components/providers/preferences-provider'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

const stories = [
  { name: 'Your story', initials: '+', own: true },
  { name: 'Study', initials: 'S', brand: true },
]

const localConversation = {
  id: 'private-notes',
  name: 'Private notes',
  preview: 'Your notes stay on this device',
  time: '—',
  unread: 0,
}

export function StudyChatHub() {
  const { locale, t } = usePreferences()
  const rtl = locale === 'ar'
  const [query, setQuery] = useState('')
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)

  const privateNotes = useMemo(() => {
    return localConversation.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())
      || localConversation.preview.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  }, [query])

  return (
    <div className="study-ambient relative -mx-4 -mt-5 min-h-[calc(100dvh-7rem)] overflow-hidden px-4 pb-8 pt-5 md:-mx-8 md:-mt-8 md:px-8 md:pt-8">
      <div aria-hidden="true" className="pointer-events-none absolute -end-24 top-24 size-72 rounded-full bg-[radial-gradient(circle,oklch(0.55_0.2_285_/0.22),transparent_68%)] blur-2xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -start-32 bottom-10 size-80 rounded-full bg-[radial-gradient(circle,oklch(0.55_0.16_240_/0.16),transparent_68%)] blur-2xl" />

      <div className="relative mx-auto max-w-5xl space-y-6">
        <header className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[.22em] text-primary/90">STUDY • COMMUNITY</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">{t('nav.chats')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {rtl ? 'مساحة هادئة لمحادثات المذاكرة واللحظات المشتركة' : 'A calm space for study conversations and shared moments.'}
            </p>
          </div>
          <button type="button" onClick={() => setNewChatOpen(true)} aria-label={rtl ? 'محادثة جديدة' : 'New conversation'} className="ambient-orb flex size-12 shrink-0 items-center justify-center rounded-2xl text-foreground transition-transform hover:-translate-y-0.5">
            <Plus className="size-5" />
          </button>
          <button type="button" aria-label={rtl ? 'الإشعارات' : 'Notifications'} className="glass-subtle flex size-11 shrink-0 items-center justify-center rounded-2xl text-muted-foreground">
            <Bell className="size-5" />
          </button>
        </header>

        <div className="glass-standard flex items-center gap-3 rounded-2xl px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={rtl ? 'ابحث في المحادثات...' : 'Search conversations...'}
            aria-label={rtl ? 'ابحث في المحادثات' : 'Search conversations'}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/80"
          />
          {query ? <button type="button" aria-label={rtl ? 'مسح البحث' : 'Clear search'} onClick={() => setQuery('')}><X className="size-4 text-muted-foreground" /></button> : <kbd className="hidden rounded-lg border border-border/70 bg-background/50 px-2 py-1 text-[10px] text-muted-foreground sm:block">⌘ K</kbd>}
        </div>

        <section aria-labelledby="study-stories-title" className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 id="study-stories-title" className="font-semibold">{rtl ? 'القصص' : 'Stories'}</h2>
              <p className="text-xs text-muted-foreground">{rtl ? 'لحظات من مجتمع Study' : 'Little moments from the Study community'}</p>
            </div>
            <span className="text-[11px] text-muted-foreground">{rtl ? 'قريبًا' : 'Coming with community connection'}</span>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {stories.map((story) => (
              <div key={story.name} className="flex w-[4.65rem] shrink-0 flex-col items-center gap-2">
                <div className={story.own ? 'grid size-[4.2rem] place-items-center rounded-full border border-dashed border-primary/70 bg-primary/10 text-primary' : 'grid size-[4.2rem] place-items-center rounded-full bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-500 p-[2px] shadow-[0_0_24px_-10px_var(--primary)]'}>
                  <span className={story.own ? '' : 'grid size-full place-items-center rounded-full border-[3px] border-background bg-[radial-gradient(circle_at_30%_25%,oklch(0.45_0.12_245),oklch(0.17_0.05_270))]'}>
                    {story.own ? <Plus className="size-6" /> : <span className="text-xl font-semibold text-white">S</span>}
                  </span>
                </div>
                <span className="max-w-full truncate text-xs">{story.name}</span>
              </div>
            ))}
            <div className="flex min-w-28 items-center justify-center rounded-2xl border border-dashed border-border/80 px-3 text-center text-[11px] text-muted-foreground">
              {rtl ? 'ستظهر قصص الأصدقاء هنا عند ربطها' : 'Friends’ stories appear here when connected'}
            </div>
          </div>
        </section>

        <section className="glass-standard study-edge overflow-hidden rounded-[1.65rem]">
          <button type="button" onClick={() => setActivityOpen((value) => !value)} aria-expanded={activityOpen} className="flex w-full items-center gap-3 p-4 text-start transition-colors hover:bg-white/[0.025]">
            <div className="ambient-orb grid size-11 shrink-0 place-items-center rounded-2xl text-primary-foreground">
              <Sparkles className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{rtl ? 'نشاط المجتمع' : 'Community activity'}</p>
              <p className="text-xs text-muted-foreground">{rtl ? 'سيظهر نشاط الأصدقاء بعد تفعيل الاتصال بالمجتمع' : 'Friends’ updates will appear after community connection.'}</p>
            </div>
            <ChevronRight className={'size-4 text-muted-foreground transition-transform ' + (activityOpen ? 'rotate-90' : (rtl ? '-rotate-180' : ''))} />
          </button>
          {activityOpen ? (
            <div className="border-t border-border/70 px-4 py-3 text-sm text-muted-foreground">
              {rtl ? 'لا توجد تحديثات متصلة لعرضها حاليًا.' : 'No connected activity to show yet.'}
            </div>
          ) : null}
        </section>

        <section className="space-y-3" aria-labelledby="conversations-heading">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 id="conversations-heading" className="text-lg font-semibold">{rtl ? 'محادثاتك' : 'Your conversations'}</h2>
              <p className="text-xs text-muted-foreground">{rtl ? 'كل محادثاتك في مكان واحد' : 'Keep every conversation in one place.'}</p>
            </div>
            <button type="button" onClick={() => setNewChatOpen(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
              <UsersRound className="size-4" /> {rtl ? 'ابدأ محادثة' : 'New chat'}
            </button>
          </div>

          {privateNotes && !query ? (
            <Link href="/chats?view=notes" className="glass-standard study-edge flex items-center gap-3 rounded-2xl p-4 transition-transform hover:-translate-y-0.5">
              <span className="ambient-orb grid size-12 shrink-0 place-items-center rounded-2xl text-primary-foreground">
                <Bookmark className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-semibold">
                  {rtl ? 'ملاحظاتي الخاصة' : 'Private notes'}
                  <span className="rounded-full border border-border/70 bg-background/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{rtl ? 'على هذا الجهاز' : 'This device only'}</span>
                </span>
                <span className="mt-1 block truncate text-sm text-muted-foreground">{rtl ? 'ملاحظاتك محفوظة محليًا على هذا الجهاز' : 'Your notes stay on this device.'}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100" />
            </Link>
          ) : null}

          <div className="glass-standard study-edge flex flex-col items-center gap-3 rounded-[1.65rem] px-5 py-8 text-center">
            <div className="ambient-orb grid size-14 place-items-center rounded-[1.25rem] text-primary">
              <MessageCircle className="size-6" />
            </div>
            <div className="max-w-md space-y-1">
              <h3 className="font-semibold">{rtl ? 'محادثات المجتمع غير متصلة بعد' : 'Community conversations aren’t connected yet'}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {rtl ? 'توجد بنية المحادثات في قاعدة البيانات، لكن واجهة التطبيق لم تُربط بها بعد. ستظهر محادثاتك الحقيقية هنا بعد توصيل الخدمة بأمان.' : 'The conversation schema exists in the backend, but this app screen is not connected to it yet. Your real chats will appear here once the authorized service is wired in.'}
              </p>
            </div>
            <Button onClick={() => setNewChatOpen(true)} variant="outline" size="sm" className="mt-1 rounded-xl">
              <Plus data-icon="inline-start" />
              {rtl ? 'ابدأ محادثة جديدة' : 'Start a conversation'}
            </Button>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { icon: Camera, title: rtl ? 'إضافة قصة' : 'Add a story', caption: rtl ? 'قصتك اليومية' : 'Share a moment' },
            { icon: UsersRound, title: rtl ? 'الأصدقاء' : 'Friends', caption: rtl ? 'ابحث عن زملائك' : 'Find study partners' },
            { icon: CircleHelp, title: rtl ? 'مركز المساعدة' : 'Help center', caption: rtl ? 'اعرف المزيد' : 'Learn more' },
          ].map(({ icon: Icon, title, caption }) => (
            <div key={title} className="glass-subtle flex items-center gap-3 rounded-2xl p-3 opacity-75">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span>
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{title}</span><span className="block truncate text-[11px] text-muted-foreground">{caption}</span></span>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent className="glass-modal max-w-md rounded-3xl">
          <div className="flex items-center gap-3">
            <div className="ambient-orb grid size-11 place-items-center rounded-2xl text-primary-foreground"><UsersRound className="size-5" /></div>
            <div>
              <DialogTitle>{rtl ? 'محادثة جديدة' : 'New conversation'}</DialogTitle>
              <DialogDescription>{rtl ? 'ابدأ محادثة مع أحد أعضاء المجتمع بعد ربط دليل الأعضاء.' : 'Start a conversation once the community member directory is connected.'}</DialogDescription>
            </div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/30 p-4 text-sm text-muted-foreground">
            {rtl ? 'دليل الأعضاء غير متصل حاليًا. لم نعرض بيانات تجريبية أو أعضاء غير حقيقيين.' : 'Member discovery is not connected. No sample or fabricated members are shown.'}
          </div>
          <Button variant="outline" onClick={() => setNewChatOpen(false)} className="w-full rounded-xl">{rtl ? 'إغلاق' : 'Close'}</Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
