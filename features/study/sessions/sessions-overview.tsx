'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, History, Info, Plus, Timer, TriangleAlert, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/headers'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useT } from '@/components/providers/preferences-provider'
import { groupSessions, type SessionGroup } from '@/lib/sessions/logic'
import type { StudySession } from '@/lib/sessions/types'
import { CreateSessionDialog } from './create-session-dialog'
import { SessionCard } from './session-card'
import { sessionsStore, useNow, useSessions } from './use-sessions'

const TABS: { value: SessionGroup; icon: React.ReactNode }[] = [
  { value: 'active', icon: <Timer /> },
  { value: 'upcoming', icon: <CalendarClock /> },
  { value: 'completed', icon: <History /> },
]

export function SessionsOverview() {
  const t = useT()
  const router = useRouter()
  const snapshot = useSessions()
  const [tab, setTab] = useState<SessionGroup>('active')
  const [creating, setCreating] = useState(false)

  const groups = useMemo(() => groupSessions(snapshot.sessions), [snapshot.sessions])
  const now = useNow(groups.active.length > 0 ? 1000 : 30_000)

  const onCreated = (session: StudySession) => {
    if (session.mode === 'instant') router.push(`/study/sessions/${session.id}`)
    else setTab('upcoming')
  }

  const createButton = (
    <Button onClick={() => setCreating(true)}>
      <Plus aria-hidden="true" />
      {t('sessions.create')}
    </Button>
  )

  return (
    <div>
      <PageHeader title={t('study.title')} description={t('study.description')} actions={createButton} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <p className="flex items-start gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t('sessions.localNotice')}
          </p>

          {snapshot.writeFailed ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-danger/15 px-3 py-2 text-sm text-danger"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">{t('sessions.writeError')}</span>
              <button type="button" className="font-medium underline" onClick={sessionsStore.dismissWriteError}>
                {t('common.close')}
              </button>
            </p>
          ) : null}

          {snapshot.status === 'loading' ? (
            <Card>
              <LoadingState label={t('sessions.loading')} />
            </Card>
          ) : snapshot.status === 'error' ? (
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
          ) : (
            <Tabs value={tab} onValueChange={(value) => setTab(value as SessionGroup)}>
              <TabsList>
                {TABS.map(({ value }) => (
                  <TabsTrigger key={value} value={value}>
                    {t(`sessions.tab.${value}`)}
                    {groups[value].length > 0 ? (
                      <span className="ms-1.5 rounded-full bg-secondary px-1.5 text-xs tabular-nums">
                        {groups[value].length}
                      </span>
                    ) : null}
                  </TabsTrigger>
                ))}
              </TabsList>
              {TABS.map(({ value, icon }) => (
                <TabsContent key={value} value={value}>
                  {groups[value].length === 0 ? (
                    <Card>
                      <EmptyState
                        icon={icon}
                        title={t(`sessions.empty.${value}.title`)}
                        description={t(`sessions.empty.${value}.description`)}
                        action={
                          value !== 'completed' ? (
                            <Button variant="outline" onClick={() => setCreating(true)}>
                              <Plus aria-hidden="true" />
                              {t('sessions.create')}
                            </Button>
                          ) : undefined
                        }
                      />
                    </Card>
                  ) : (
                    <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                      {groups[value].map((session) => (
                        <li key={session.id}>
                          <SessionCard session={session} now={now} />
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>

        <Card variant="panel" className="h-fit">
          <EmptyState
            icon={<Users />}
            title={t('study.workspace.title')}
            description={t('study.workspace.description')}
          />
        </Card>
      </div>

      <CreateSessionDialog open={creating} onOpenChange={setCreating} onCreated={onCreated} />
    </div>
  )
}
