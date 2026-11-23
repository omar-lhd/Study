'use client'

import { Info } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { SectionHeader } from '@/components/ui/headers'
import { useT } from '@/components/providers/preferences-provider'
import type { PersonalState } from '@/lib/sessions/types'
import { useSessionFormatters } from './use-sessions'

export function RoomAttendance({ personal }: { personal: PersonalState }) {
  const t = useT()
  const format = useSessionFormatters()

  return (
    <Card>
      <SectionHeader title={t('sessions.attendance.title')} />
      <ul>
        <li className="flex items-center gap-3">
          <Avatar name={t('sessions.attendance.you')} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t('sessions.attendance.you')}</p>
            {personal.joinedAt !== null ? (
              <p className="text-xs text-muted-foreground">
                {t('sessions.attendance.joined', { when: format.time(personal.joinedAt) })}
              </p>
            ) : null}
          </div>
          {personal.status ? <Badge variant="accent">{t(`sessions.personal.${personal.status}`)}</Badge> : null}
        </li>
      </ul>
      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {t('sessions.attendance.notice')}
      </p>
    </Card>
  )
}
