'use client'

import { Check } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { SectionHeader } from '@/components/ui/headers'
import { useT } from '@/components/providers/preferences-provider'
import { goalProgress } from '@/lib/sessions/logic'
import type { StudySession } from '@/lib/sessions/types'
import { cn } from '@/lib/utils'
import { sessionsStore } from './use-sessions'

export function RoomGoals({ session }: { session: StudySession }) {
  const t = useT()
  const progress = goalProgress(session)
  const readOnly = session.status === 'completed'

  return (
    <Card>
      <SectionHeader
        title={t('sessions.goals.title')}
        description={
          progress.total > 0 ? t('sessions.goals.progress', { done: progress.done, total: progress.total }) : undefined
        }
      />
      {session.goals.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('sessions.goals.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {session.goals.map((goal) => (
            <li key={goal.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={goal.done}
                disabled={readOnly}
                onClick={() => sessionsStore.toggleGoal(session.id, goal.id)}
                className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-border-strong bg-surface px-3 py-2 text-start transition-colors hover:border-primary disabled:cursor-default disabled:opacity-70 disabled:hover:border-border-strong"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-md border',
                    goal.done ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong',
                  )}
                >
                  {goal.done ? <Check className="size-4" /> : null}
                </span>
                <span dir="auto" className={cn('min-w-0 break-words text-sm', goal.done && 'text-muted-foreground line-through')}>
                  {goal.text}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
