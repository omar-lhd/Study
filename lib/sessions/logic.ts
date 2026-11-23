import type { CreateSessionInput, SessionGoal, StudySession } from './types'

const MINUTE = 60_000

export function durationMs(session: Pick<StudySession, 'durationMinutes'>): number {
  return session.durationMinutes * MINUTE
}

/**
 * Elapsed time is always derived from stored timestamps, never from when a
 * viewer opened the room, so late entry and refreshes show the right value.
 */
export function elapsedMs(session: StudySession, now: number): number {
  const running = session.runningSince === null ? 0 : Math.max(0, now - session.runningSince)
  const total = session.accumulatedMs + running
  return Math.min(Math.max(0, total), durationMs(session))
}

export function remainingMs(session: StudySession, now: number): number {
  return Math.max(0, durationMs(session) - elapsedMs(session, now))
}

export function progressRatio(session: StudySession, now: number): number {
  const total = durationMs(session)
  return total === 0 ? 0 : elapsedMs(session, now) / total
}

/** Completes an active session whose time ran out, using the exact moment it ended. */
export function reconcile(session: StudySession, now: number): StudySession {
  if (session.status !== 'active' || session.runningSince === null) return session
  const rawElapsed = session.accumulatedMs + Math.max(0, now - session.runningSince)
  if (rawElapsed < durationMs(session)) return session
  const endedAt = session.runningSince + (durationMs(session) - session.accumulatedMs)
  return {
    ...session,
    status: 'completed',
    accumulatedMs: durationMs(session),
    runningSince: null,
    endedAt,
    updatedAt: now,
  }
}

export function createSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function buildSession(input: CreateSessionInput, now: number, id: string = createSessionId()): StudySession {
  const goals: SessionGoal[] = input.goals.map((text, index) => ({
    id: `${id}-g${index}-${Math.random().toString(36).slice(2, 6)}`,
    text,
    done: false,
  }))
  const instant = input.mode === 'instant'
  return {
    id,
    title: input.title,
    subject: input.subject,
    description: input.description,
    durationMinutes: input.durationMinutes,
    visibility: input.visibility,
    mode: input.mode,
    scheduledFor: instant ? null : input.scheduledFor,
    status: instant ? 'active' : 'scheduled',
    createdAt: now,
    startedAt: instant ? now : null,
    accumulatedMs: 0,
    runningSince: instant ? now : null,
    endedAt: null,
    goals,
    notes: '',
    updatedAt: now,
  }
}

export function startSession(session: StudySession, now: number): StudySession {
  if (session.status !== 'scheduled') return session
  return {
    ...session,
    status: 'active',
    startedAt: now,
    runningSince: now,
    updatedAt: now,
  }
}

export function pauseSession(session: StudySession, now: number): StudySession {
  const current = reconcile(session, now)
  if (current.status !== 'active' || current.runningSince === null) return current
  return {
    ...current,
    status: 'paused',
    accumulatedMs: current.accumulatedMs + Math.max(0, now - current.runningSince),
    runningSince: null,
    updatedAt: now,
  }
}

export function resumeSession(session: StudySession, now: number): StudySession {
  if (session.status !== 'paused') return session
  return { ...session, status: 'active', runningSince: now, updatedAt: now }
}

export function endSession(session: StudySession, now: number): StudySession {
  const current = reconcile(session, now)
  if (current.status === 'completed' || current.status === 'scheduled') return current
  const running = current.runningSince === null ? 0 : Math.max(0, now - current.runningSince)
  return {
    ...current,
    status: 'completed',
    accumulatedMs: Math.min(current.accumulatedMs + running, durationMs(current)),
    runningSince: null,
    endedAt: now,
    updatedAt: now,
  }
}

export function toggleGoal(session: StudySession, goalId: string, now: number): StudySession {
  if (session.status === 'completed') return session
  return {
    ...session,
    goals: session.goals.map((goal) => (goal.id === goalId ? { ...goal, done: !goal.done } : goal)),
    updatedAt: now,
  }
}

export function setNotes(session: StudySession, notes: string, now: number): StudySession {
  if (session.status === 'completed' || session.notes === notes) return session
  return { ...session, notes, updatedAt: now }
}

export type SessionGroup = 'active' | 'upcoming' | 'completed'

export function groupOf(session: StudySession): SessionGroup {
  if (session.status === 'completed') return 'completed'
  if (session.status === 'scheduled') return 'upcoming'
  return 'active'
}

export function groupSessions(sessions: StudySession[]): Record<SessionGroup, StudySession[]> {
  const groups: Record<SessionGroup, StudySession[]> = { active: [], upcoming: [], completed: [] }
  for (const session of sessions) groups[groupOf(session)].push(session)
  groups.active.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
  groups.upcoming.sort((a, b) => (a.scheduledFor ?? 0) - (b.scheduledFor ?? 0))
  groups.completed.sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
  return groups
}

export function isDue(session: StudySession, now: number): boolean {
  return session.status === 'scheduled' && session.scheduledFor !== null && session.scheduledFor <= now
}

export function goalProgress(session: StudySession): { done: number; total: number } {
  return { done: session.goals.filter((goal) => goal.done).length, total: session.goals.length }
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}
