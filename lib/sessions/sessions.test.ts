import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildSession,
  elapsedMs,
  endSession,
  formatClock,
  groupSessions,
  pauseSession,
  reconcile,
  remainingMs,
  resumeSession,
  setNotes,
  startSession,
  toggleGoal,
} from './logic.ts'
import { toTimestamp, validateSessionForm, type SessionFormValues } from './validation.ts'
import type { CreateSessionInput } from './types.ts'

const MIN = 60_000
const T0 = Date.UTC(2026, 0, 1, 10, 0, 0)

const instant: CreateSessionInput = {
  title: 'Physics review',
  subject: 'Physics',
  description: '',
  durationMinutes: 30,
  visibility: 'private',
  mode: 'instant',
  scheduledFor: null,
  goals: ['Chapter 4', 'Past paper'],
}

describe('timer calculations', () => {
  it('derives elapsed time from the start timestamp, so late entry does not restart', () => {
    const session = buildSession(instant, T0, 's1')
    assert.equal(elapsedMs(session, T0), 0)
    assert.equal(elapsedMs(session, T0 + 12 * MIN), 12 * MIN)
    assert.equal(remainingMs(session, T0 + 12 * MIN), 18 * MIN)
  })

  it('pauses, excludes paused time and resumes', () => {
    let session = buildSession(instant, T0, 's1')
    session = pauseSession(session, T0 + 10 * MIN)
    assert.equal(session.status, 'paused')
    assert.equal(elapsedMs(session, T0 + 50 * MIN), 10 * MIN)
    session = resumeSession(session, T0 + 20 * MIN)
    assert.equal(session.status, 'active')
    assert.equal(elapsedMs(session, T0 + 25 * MIN), 15 * MIN)
  })

  it('completes automatically at the exact end moment, even when reopened late', () => {
    const session = buildSession(instant, T0, 's1')
    const done = reconcile(session, T0 + 5 * 60 * MIN)
    assert.equal(done.status, 'completed')
    assert.equal(done.endedAt, T0 + 30 * MIN)
    assert.equal(elapsedMs(done, T0 + 999 * MIN), 30 * MIN)
  })

  it('does not auto-complete a paused session', () => {
    const paused = pauseSession(buildSession(instant, T0, 's1'), T0 + 5 * MIN)
    assert.equal(reconcile(paused, T0 + 500 * MIN).status, 'paused')
  })

  it('ends manually and freezes elapsed time', () => {
    const ended = endSession(buildSession(instant, T0, 's1'), T0 + 7 * MIN)
    assert.equal(ended.status, 'completed')
    assert.equal(elapsedMs(ended, T0 + 100 * MIN), 7 * MIN)
  })

  it('starts a scheduled session only from the scheduled state', () => {
    const scheduled = buildSession({ ...instant, mode: 'scheduled', scheduledFor: T0 + 60 * MIN }, T0, 's2')
    assert.equal(scheduled.status, 'scheduled')
    assert.equal(elapsedMs(scheduled, T0 + 90 * MIN), 0)
    const started = startSession(scheduled, T0 + 90 * MIN)
    assert.equal(started.status, 'active')
    assert.equal(elapsedMs(started, T0 + 100 * MIN), 10 * MIN)
    assert.equal(startSession(started, T0 + 120 * MIN), started)
  })
})

describe('goals, notes and grouping', () => {
  it('toggles goals and locks completed sessions', () => {
    const session = buildSession(instant, T0, 's1')
    const goalId = session.goals[0]!.id
    const toggled = toggleGoal(session, goalId, T0 + 1)
    assert.equal(toggled.goals[0]!.done, true)
    const ended = endSession(toggled, T0 + 2)
    assert.equal(toggleGoal(ended, goalId, T0 + 3), ended)
    assert.equal(setNotes(ended, 'late', T0 + 3), ended)
  })

  it('groups and sorts sessions', () => {
    const a = buildSession({ ...instant, mode: 'scheduled', scheduledFor: T0 + 120 * MIN }, T0, 'a')
    const b = buildSession({ ...instant, mode: 'scheduled', scheduledFor: T0 + 60 * MIN }, T0, 'b')
    const c = endSession(buildSession(instant, T0, 'c'), T0 + MIN)
    const d = pauseSession(buildSession(instant, T0, 'd'), T0 + MIN)
    const groups = groupSessions([a, b, c, d])
    assert.deepEqual(groups.upcoming.map((s) => s.id), ['b', 'a'])
    assert.deepEqual(groups.completed.map((s) => s.id), ['c'])
    assert.deepEqual(groups.active.map((s) => s.id), ['d'])
  })

  it('formats the clock', () => {
    assert.equal(formatClock(0), '00:00')
    assert.equal(formatClock(65_000), '01:05')
    assert.equal(formatClock(3_725_000), '1:02:05')
  })
})

describe('validation', () => {
  const base: SessionFormValues = {
    title: 'Math',
    subject: '',
    description: '',
    duration: '45',
    mode: 'instant',
    date: '',
    time: '',
    visibility: 'private',
    goals: [],
  }
  const now = new Date(2026, 0, 1, 10, 0).getTime()

  it('accepts a valid instant session', () => {
    assert.deepEqual(validateSessionForm(base, now), {})
  })

  it('rejects bad titles and durations', () => {
    assert.equal(validateSessionForm({ ...base, title: ' ' }, now).title, 'titleRequired')
    assert.equal(validateSessionForm({ ...base, title: 'a' }, now).title, 'titleShort')
    assert.equal(validateSessionForm({ ...base, duration: '2' }, now).duration, 'durationRange')
    assert.equal(validateSessionForm({ ...base, duration: '1.5' }, now).duration, 'durationInvalid')
    assert.equal(validateSessionForm({ ...base, duration: '' }, now).duration, 'durationInvalid')
  })

  it('requires a future date and time when scheduling', () => {
    const scheduled = { ...base, mode: 'scheduled' as const }
    assert.equal(validateSessionForm(scheduled, now).date, 'dateRequired')
    assert.equal(validateSessionForm({ ...scheduled, date: '2025-12-31', time: '09:00' }, now).time, 'datePast')
    assert.deepEqual(validateSessionForm({ ...scheduled, date: '2026-01-02', time: '09:00' }, now), {})
  })

  it('parses local timestamps and rejects impossible dates', () => {
    assert.equal(toTimestamp('2026-02-30', '10:00'), null)
    assert.equal(toTimestamp('2026-01-01', '10:00'), new Date(2026, 0, 1, 10, 0).getTime())
  })
})
