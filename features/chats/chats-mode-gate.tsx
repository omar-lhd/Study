'use client'

import { BookOpen, MessageCircle, Sparkles, UsersRound } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { usePreferences } from '@/components/providers/preferences-provider'
import { CloudChatsExperience } from './cloud-chats-experience'
import { readCloudSession, subscribeCloudSession } from '@/lib/chats/cloud-client'

function SignedOutChats() {
  const { t } = usePreferences()
  const openSignIn = () => window.dispatchEvent(new Event('study:open-auth'))

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-5 pb-6">
      <header className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.16em] text-primary">{t('chats.eyebrow')}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{t('chats.title')}</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t('chats.description')}</p>
        </div>
        <Button variant="outline" size="icon" className="size-11 rounded-2xl" aria-label={t('cloud.auth.join')} onClick={openSignIn}><UsersRound className="size-5"/></Button>
      </header>

      <section className="relative overflow-hidden rounded-[2rem] border border-border bg-card shadow-panel">
        <div className="absolute -end-14 -top-20 size-64 rounded-full bg-primary/10 blur-3xl" aria-hidden="true"/>
        <div className="absolute -bottom-20 start-1/3 size-56 rounded-full bg-accent/10 blur-3xl" aria-hidden="true"/>
        <div className="relative grid gap-6 p-5 sm:p-8 md:grid-cols-[1.15fr_.85fr] md:items-center md:p-10">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"><Sparkles className="size-3.5"/>{t('chats.welcome.kicker')}</span>
            <h2 className="mt-4 text-2xl font-bold leading-tight tracking-tight sm:text-4xl">{t('chats.welcome.title')}</h2>
            <p className="mt-3 max-w-lg text-sm leading-7 text-muted-foreground sm:text-base">{t('chats.welcome.description')}</p>
            <Button className="mt-5 rounded-xl px-5" onClick={openSignIn}>{t('cloud.auth.join')}<MessageCircle data-icon="inline-end"/></Button>
            <p className="mt-3 text-xs text-muted-foreground">{t('chats.welcome.privateNote')}</p>
          </div>
          <div className="mx-auto flex w-full max-w-xs flex-col items-center py-2" aria-hidden="true">
            <div className="relative flex aspect-square w-full items-center justify-center rounded-[2.25rem] border border-border bg-background/70">
              <div className="absolute inset-5 rounded-[1.75rem] border border-dashed border-primary/30"/>
              <div className="relative flex size-28 items-center justify-center rounded-[2rem] bg-primary text-primary-foreground shadow-float sm:size-32">
                <BookOpen className="size-14 stroke-[1.4] sm:size-16"/>
              </div>
              <span className="absolute start-[13%] top-[18%] flex size-12 items-center justify-center rounded-2xl border border-border bg-elevated text-accent"><MessageCircle className="size-5"/></span>
              <span className="absolute end-[12%] top-[25%] flex size-11 items-center justify-center rounded-2xl border border-border bg-elevated text-primary"><Sparkles className="size-5"/></span>
              <span className="absolute bottom-[14%] start-[18%] flex size-10 items-center justify-center rounded-xl border border-border bg-elevated text-primary"><UsersRound className="size-4"/></span>
              <span className="absolute bottom-[13%] end-[17%] size-3 rounded-full bg-accent shadow-[0_0_0_8px_var(--selection)]"/>
            </div>
            <p className="mt-3 text-center text-xs font-medium text-muted-foreground">{t('chats.welcome.artCaption')}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary"><UsersRound className="size-5"/></div>
          <h3 className="font-semibold">{t('chats.welcome.membersTitle')}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('chats.welcome.membersDescription')}</p>
        </article>
        <article className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-accent/12 text-accent"><BookOpen className="size-5"/></div>
          <h3 className="font-semibold">{t('chats.welcome.studyTitle')}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('chats.welcome.studyDescription')}</p>
        </article>
      </section>
    </div>
  )
}

export function ChatsModeGate() {
  const session = useSyncExternalStore(subscribeCloudSession, readCloudSession, () => null)
  return session ? <CloudChatsExperience /> : <SignedOutChats />
}
