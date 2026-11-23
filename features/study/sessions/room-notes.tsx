'use client'

import { useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/field'
import { SectionHeader } from '@/components/ui/headers'
import { useT } from '@/components/providers/preferences-provider'
import { LIMITS } from '@/lib/sessions/validation'
import type { StudySession } from '@/lib/sessions/types'
import { sessionsStore } from './use-sessions'

const SAVE_DELAY_MS = 500

export function RoomNotes({ session }: { session: StudySession }) {
  const t = useT()
  const sessionId = session.id
  const readOnly = session.status === 'completed'
  const [draft, setDraft] = useState(session.notes)
  const latest = useRef(session.notes)
  const timer = useRef<number | null>(null)

  const commit = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    sessionsStore.setNotes(sessionId, latest.current)
  }

  const onChange = (value: string) => {
    latest.current = value
    setDraft(value)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(commit, SAVE_DELAY_MS)
  }

  useEffect(
    () => () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current)
        sessionsStore.setNotes(sessionId, latest.current)
      }
    },
    [sessionId],
  )

  return (
    <Card>
      <SectionHeader title={t('sessions.notes.title')} />
      <Textarea
        aria-label={t('sessions.notes.title')}
        value={draft}
        readOnly={readOnly}
        maxLength={LIMITS.notesMax}
        placeholder={t('sessions.notes.placeholder')}
        onChange={(event) => onChange(event.target.value)}
        onBlur={commit}
        className="min-h-40"
      />
      <p className="mt-2 text-xs text-muted-foreground">{t('sessions.notes.hint')}</p>
    </Card>
  )
}
