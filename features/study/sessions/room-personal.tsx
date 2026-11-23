'use client'

import { Coffee, MessagesSquare, Toilet } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { SectionHeader } from '@/components/ui/headers'
import { useT } from '@/components/providers/preferences-provider'
import { formatClock } from '@/lib/sessions/logic'
import type { PersonalState, PersonalStatus, StudySession } from '@/lib/sessions/types'
import { cn } from '@/lib/utils'
import { sessionsStore } from './use-sessions'

const STATUS_OPTIONS: { value: PersonalStatus; icon: React.ReactNode }[] = [
  { value: 'coffee', icon: <Coffee className="size-5" /> },
  { value: 'restroom', icon: <Toilet className="size-5" /> },
  { value: 'quickTalk', icon: <MessagesSquare className="size-5" /> },
]

interface Props {
  session: StudySession
  personal: PersonalState
  now: number
}

export function RoomPersonal({ session, personal, now }: Props) {
  const t = useT()
  const disabled = session.status === 'completed'

  return (
    <Card className="space-y-4">
      <SectionHeader title={t('sessions.personal.title')} description={t('sessions.personal.description')} className="pb-0" />

      <div role="group" aria-label={t('sessions.personal.title')} className="grid grid-cols-3 gap-2">
        {STATUS_OPTIONS.map(({ value, icon }) => {
          const selected = personal.status === value
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => sessionsStore.setPersonalStatus(session.id, selected ? null : value)}
              className={cn(
                'flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border px-1 text-center text-xs font-medium transition-colors disabled:opacity-50',
                selected
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border-strong bg-surface text-muted-foreground hover:text-foreground',
              )}
            >
              <span aria-hidden="true">{icon}</span>
              {t(`sessions.personal.${value}`)}
            </button>
          )
        })}
      </div>

      {personal.status && personal.statusSince !== null ? (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-accent/20 px-3 py-2 text-sm" role="status">
          <span className="tabular-nums">
            {t('sessions.personal.since', {
              status: t(`sessions.personal.${personal.status}`),
              time: `\u2066${formatClock(now - personal.statusSince)}\u2069`,
            })}
          </span>
          <button
            type="button"
            onClick={() => sessionsStore.setPersonalStatus(session.id, null)}
            className="shrink-0 font-medium underline underline-offset-2"
          >
            {t('sessions.personal.clear')}
          </button>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
        <div className="min-w-0">
          <p id={`focus-label-${session.id}`} className="text-sm font-medium">
            {t('sessions.focus.label')}
          </p>
          <p id={`focus-desc-${session.id}`} className="text-xs text-muted-foreground">
            {t('sessions.focus.description')}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={personal.focusMode}
          aria-labelledby={`focus-label-${session.id}`}
          aria-describedby={`focus-desc-${session.id}`}
          onClick={() => sessionsStore.setFocusMode(session.id, !personal.focusMode)}
          className={cn(
            'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors',
            personal.focusMode ? 'border-primary bg-primary' : 'border-border-strong bg-secondary',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'inline-block size-5 rounded-full bg-foreground transition-transform',
              personal.focusMode
                ? 'translate-x-6 rtl:-translate-x-6 bg-primary-foreground'
                : 'translate-x-1 rtl:-translate-x-1',
            )}
          />
        </button>
      </div>
    </Card>
  )
}
