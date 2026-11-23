'use client'

import { Badge } from '@/components/ui/badge'
import { useT } from '@/components/providers/preferences-provider'
import type { SessionStatus } from '@/lib/sessions/types'

const VARIANT = {
  scheduled: 'neutral',
  active: 'success',
  paused: 'warning',
  completed: 'primary',
} as const

export function SessionStatusBadge({ status, due = false }: { status: SessionStatus; due?: boolean }) {
  const t = useT()
  if (status === 'scheduled' && due) return <Badge variant="accent">{t('sessions.status.due')}</Badge>
  return <Badge variant={VARIANT[status]}>{t(`sessions.status.${status}`)}</Badge>
}
