'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, CalendarClock, Clock, Focus, SearchX, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { useT } from '@/components/providers/preferences-provider'
import { isDue, reconcile } from '@/lib/sessions/logic'
import { EMPTY_PERSONAL_STATE } from '@/lib/sessions/types'
import { cn } from '@/lib/utils'
import { RoomAttendance } from './room-attendance'
import { RoomGoals } from './room-goals'
import { RoomNotes } from './room-notes'
import { RoomPersonal } from './room-personal'
import { RoomTimer } from './room-timer'
import { SessionStatusBadge } from './session-status-badge'
import { sessionsStore, useNow, useSessionFormatters, useSessions } from './use-sessions'

function BackLink() {
  const t = useT()
  return (
    <Link href="/study" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-ms-3 mb-3')}>
      <ArrowLeft className="rtl:rotate-180" aria-hidden="true" />
      {t('sessions.room.back')}
    </Link>
  )
}

export function SessionRoom({ id }: { id: string }) {
  const t = useT()
  const format = useSessionFormatters()
  const snapshot = useSessions()

  const stored = snapshot.sessions.find((session) => session.id === id)
  const now = useNow(1000, stored !== undefined && stored.status !== 'completed')
  const session = stored ? reconcile(stored, now) : undefined
  const personal = snapshot.personal[id] ?? EMPTY_PERSONAL_STATE

  const timeUp = stored?.status === 'active' && session?.status === 'completed'
  const needsJoin =
    (stored?.status === 'active' || stored?.status === 'paused') && personal.joinedAt === null

  useEffect(() => {
    if (!timeUp) return
    sessionsStore.reconcile(id)
    toast.info(t('sessions.room.timeUp'))
  }, [timeUp, id, t])

  useEffect(() => {
    if (needsJoin) sessionsStore.joinRoom(id)
  }, [needsJoin, id])

  if (snapshot.status === 'loading') {
    return (
      <div>
        <BackLink />
        <Card>
          <LoadingState label={t('sessions.loading')} />
        </Card>
      </div>
    )
  }

  if (snapshot.status === 'error') {
    return (
      <div>
        <BackLink />
        <Card>
          <ErrorState
            icon={<TriangleAlert />}
            title={t('sessions.loadError.title')}
            description={t('sessions.loadError.description')}
            action={
              <Button variant="outline" onClick={sessionsStore.reload}>
                {t('common.retry')}
              </Button>
            }
          />
        </Card>
      </div>
    )
  }

  if (!session) {
    return (
      <div>
        <BackLink />
        <Card>
          <EmptyState
            icon={<SearchX />}
            title={t('sessions.room.notFound.title')}
            description={t('sessions.room.notFound.description')}
          />
        </Card>
      </div>
    )
  }

  const focus = personal.focusMode && session.status !== 'completed'

  return (
    <div>
      <BackLink />

      <header className="space-y-3 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 dir="auto" className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
              {session.title}
            </h1>
            {session.subject ? (
              <p dir="auto" className="text-base text-muted-foreground">
                {session.subject}
              </p>
            ) : null}
          </div>
          <span aria-live="polite">
            <SessionStatusBadge status={session.status} due={isDue(session, now)} />
          </span>
        </div>

        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <Clock className="size-4" aria-hidden="true" />
            {format.minutesLabel(session.durationMinutes)}
          </li>
          {session.scheduledFor !== null && session.status === 'scheduled' ? (
            <li className="flex items-center gap-1.5">
              <CalendarClock className="size-4" aria-hidden="true" />
              {t('sessions.room.scheduledFor', { when: format.dateTime(session.scheduledFor) })}
            </li>
          ) : null}
          {session.startedAt !== null ? (
            <li>{t('sessions.room.startedAt', { when: format.dateTime(session.startedAt) })}</li>
          ) : null}
          {session.endedAt !== null ? (
            <li>{t('sessions.room.endedAt', { when: format.dateTime(session.endedAt) })}</li>
          ) : null}
          <li>
            <Badge variant="neutral">{t(`sessions.visibility.${session.visibility}`)}</Badge>
          </li>
        </ul>

        {session.description ? (
          <p dir="auto" className="max-w-prose whitespace-pre-line text-sm text-muted-foreground">
            {session.description}
          </p>
        ) : null}

        {focus ? (
          <p className="flex items-center gap-2 text-sm font-medium text-primary">
            <Focus className="size-4" aria-hidden="true" />
            {t('sessions.focus.banner')}
          </p>
        ) : null}
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <RoomTimer session={session} now={now} focus={focus} />
          <RoomGoals session={session} />
          {focus ? null : <RoomNotes session={session} />}
        </div>
        <div className="min-w-0 space-y-4">
          <RoomPersonal session={session} personal={personal} now={now} />
          {focus ? null : <RoomAttendance personal={personal} />}
        </div>
      </div>
    </div>
  )
}
