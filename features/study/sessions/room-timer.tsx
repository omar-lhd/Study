'use client'

import { useState } from 'react'
import { Pause, Play, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useT } from '@/components/providers/preferences-provider'
import { elapsedMs, formatClock, progressRatio, remainingMs } from '@/lib/sessions/logic'
import type { StudySession } from '@/lib/sessions/types'
import { cn } from '@/lib/utils'
import { sessionsStore } from './use-sessions'

export function RoomTimer({ session, now, focus }: { session: StudySession; now: number; focus: boolean }) {
  const t = useT()
  const [confirmingEnd, setConfirmingEnd] = useState(false)
  const remaining = formatClock(remainingMs(session, now))
  const elapsed = formatClock(elapsedMs(session, now))
  const percent = Math.round(progressRatio(session, now) * 100)
  const running = session.status === 'active'

  return (
    <Card className="space-y-5 text-center">
      <div role="timer" aria-label={t('sessions.room.timer')} className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">{t('sessions.room.remaining')}</p>
        <p
          dir="ltr"
          className={cn(
            'font-bold leading-none tabular-nums tracking-tight',
            focus ? 'text-7xl sm:text-9xl' : 'text-6xl sm:text-8xl',
            session.status === 'paused' && 'text-warning',
            session.status === 'completed' && 'text-muted-foreground',
            running && 'text-foreground',
          )}
        >
          {remaining}
        </p>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{t('sessions.room.elapsed')}: </span>
          <span dir="ltr" className="tabular-nums">
            {elapsed}
          </span>
          {' · '}
          {t('sessions.room.of', { minutes: session.durationMinutes })}
        </p>
      </div>

      <div
        role="progressbar"
        aria-label={t('sessions.room.timer')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 overflow-hidden rounded-full bg-secondary"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', session.status === 'paused' ? 'bg-warning' : 'bg-primary')}
          style={{ width: `${percent}%` }}
        />
      </div>

      {session.status === 'completed' ? (
        <p className="text-sm text-muted-foreground">{t('sessions.room.ended')}</p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          {session.status === 'scheduled' ? (
            <Button size="lg" onClick={() => sessionsStore.start(session.id)}>
              <Play aria-hidden="true" />
              {t('sessions.room.start')}
            </Button>
          ) : null}
          {session.status === 'active' ? (
            <Button size="lg" variant="secondary" onClick={() => sessionsStore.pause(session.id)}>
              <Pause aria-hidden="true" />
              {t('sessions.room.pause')}
            </Button>
          ) : null}
          {session.status === 'paused' ? (
            <Button size="lg" onClick={() => sessionsStore.resume(session.id)}>
              <Play aria-hidden="true" />
              {t('sessions.room.resume')}
            </Button>
          ) : null}
          {session.status !== 'scheduled' ? (
            <Button size="lg" variant="outline" onClick={() => setConfirmingEnd(true)}>
              <Square aria-hidden="true" />
              {t('sessions.room.end')}
            </Button>
          ) : null}
        </div>
      )}

      <Dialog open={confirmingEnd} onOpenChange={setConfirmingEnd}>
        <DialogContent>
          <DialogTitle>{t('sessions.room.end.title')}</DialogTitle>
          <DialogDescription>{t('sessions.room.end.description')}</DialogDescription>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="ghost">{t('common.cancel')}</Button>
            </DialogClose>
            <Button
              variant="danger"
              onClick={() => {
                sessionsStore.end(session.id)
                setConfirmingEnd(false)
              }}
            >
              {t('sessions.room.end')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
