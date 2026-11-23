'use client'

import Link from 'next/link'
import { ArrowRight, CalendarClock, CheckCircle2, Clock, Target } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { useT } from '@/components/providers/preferences-provider'
import { formatClock, goalProgress, isDue, remainingMs } from '@/lib/sessions/logic'
import type { StudySession } from '@/lib/sessions/types'
import { cn } from '@/lib/utils'
import { SessionStatusBadge } from './session-status-badge'
import { useSessionFormatters } from './use-sessions'

export function SessionCard({ session, now }: { session: StudySession; now: number }) {
  const t = useT()
  const format = useSessionFormatters()
  const goals = goalProgress(session)
  const live = session.status === 'active' || session.status === 'paused'

  const timeLine =
    session.status === 'completed' && session.endedAt !== null
      ? t('sessions.meta.endedAt', { when: format.dateTime(session.endedAt) })
      : session.status === 'scheduled' && session.scheduledFor !== null
        ? t('sessions.meta.startsAt', { when: format.dateTime(session.scheduledFor) })
        : session.startedAt !== null
          ? t('sessions.meta.startedAt', { when: format.dateTime(session.startedAt) })
          : null

  const actionLabel = live
    ? t('sessions.card.enter')
    : session.status === 'completed'
      ? t('sessions.card.summary')
      : t('sessions.card.details')

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 dir="auto" className="truncate text-base font-semibold">
            {session.title}
          </h3>
          {session.subject ? (
            <p dir="auto" className="truncate text-sm text-muted-foreground">
              {session.subject}
            </p>
          ) : null}
        </div>
        <SessionStatusBadge status={session.status} due={isDue(session, now)} />
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <Clock className="size-4" aria-hidden="true" />
          {format.minutesLabel(session.durationMinutes)}
        </li>
        {timeLine ? (
          <li className="flex items-center gap-1.5">
            <CalendarClock className="size-4" aria-hidden="true" />
            {timeLine}
          </li>
        ) : null}
        {goals.total > 0 ? (
          <li className="flex items-center gap-1.5">
            <Target className="size-4" aria-hidden="true" />
            {t('sessions.meta.goals', { done: goals.done, total: goals.total })}
          </li>
        ) : null}
        {live ? (
          <li className="flex items-center gap-1.5 font-medium text-foreground">
            <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
            <span className="tabular-nums">
              {t('sessions.meta.remaining', { time: `\u2066${formatClock(remainingMs(session, now))}\u2069` })}
            </span>
          </li>
        ) : null}
      </ul>

      <Link
        href={`/study/sessions/${session.id}`}
        className={cn(buttonVariants({ variant: live ? 'primary' : 'outline' }), 'w-full sm:w-auto sm:self-start')}
      >
        {actionLabel}
        <ArrowRight className="rtl:rotate-180" aria-hidden="true" />
      </Link>
    </Card>
  )
}
