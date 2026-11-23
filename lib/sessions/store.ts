import {
  buildSession,
  endSession,
  pauseSession,
  reconcile,
  resumeSession,
  setNotes,
  startSession,
  toggleGoal,
} from './logic'
import type { SessionsRepository } from './repository'
import {
  EMPTY_PERSONAL_STATE,
  type CreateSessionInput,
  type PersonalState,
  type PersonalStatus,
  type StudySession,
} from './types'

export interface SessionsSnapshot {
  status: 'loading' | 'ready' | 'error'
  sessions: StudySession[]
  personal: Record<string, PersonalState>
  /** True when the last write failed; in-memory data is still shown. */
  writeFailed: boolean
}

const LOADING: SessionsSnapshot = { status: 'loading', sessions: [], personal: {}, writeFailed: false }

export function createSessionsStore(repository: SessionsRepository) {
  let snapshot: SessionsSnapshot = LOADING
  let started = false
  let stopExternal: (() => void) | null = null
  const listeners = new Set<() => void>()

  const emit = (next: SessionsSnapshot) => {
    snapshot = next
    listeners.forEach((listener) => listener())
  }

  const persistSession = (session: StudySession) => {
    repository.saveSession(session).catch(() => emit({ ...snapshot, writeFailed: true }))
  }

  const persistPersonal = (id: string, state: PersonalState) => {
    repository.savePersonal(id, state).catch(() => emit({ ...snapshot, writeFailed: true }))
  }

  const load = async () => {
    try {
      const [stored, personal] = await Promise.all([repository.list(), repository.loadPersonal()])
      const now = Date.now()
      const sessions = stored.map((session) => {
        const next = reconcile(session, now)
        if (next !== session) persistSession(next)
        return next
      })
      emit({ status: 'ready', sessions, personal, writeFailed: false })
    } catch {
      emit({ status: 'error', sessions: [], personal: {}, writeFailed: false })
    }
  }

  const replace = (id: string, change: (session: StudySession, now: number) => StudySession) => {
    const current = snapshot.sessions.find((session) => session.id === id)
    if (!current) return
    const next = change(current, Date.now())
    if (next === current) return
    emit({ ...snapshot, sessions: snapshot.sessions.map((session) => (session.id === id ? next : session)) })
    persistSession(next)
  }

  const updatePersonal = (id: string, change: (state: PersonalState, now: number) => PersonalState) => {
    const current = snapshot.personal[id] ?? EMPTY_PERSONAL_STATE
    const next = change(current, Date.now())
    if (next === current) return
    emit({ ...snapshot, personal: { ...snapshot.personal, [id]: next } })
    persistPersonal(id, next)
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      if (!started) {
        started = true
        void load()
        stopExternal = repository.subscribe(() => void load())
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          stopExternal?.()
          stopExternal = null
          started = false
        }
      }
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => LOADING,

    reload() {
      emit(LOADING)
      void load()
    },

    create(input: CreateSessionInput): StudySession {
      const session = buildSession(input, Date.now())
      emit({ ...snapshot, status: 'ready', sessions: [...snapshot.sessions, session] })
      persistSession(session)
      return session
    },

    start: (id: string) => replace(id, startSession),
    pause: (id: string) => replace(id, pauseSession),
    resume: (id: string) => replace(id, resumeSession),
    end: (id: string) => replace(id, endSession),
    reconcile: (id: string) => replace(id, reconcile),
    toggleGoal: (id: string, goalId: string) => replace(id, (session, now) => toggleGoal(session, goalId, now)),
    setNotes: (id: string, notes: string) => replace(id, (session, now) => setNotes(session, notes, now)),

    joinRoom: (id: string) =>
      updatePersonal(id, (state, now) => (state.joinedAt === null ? { ...state, joinedAt: now } : state)),
    setPersonalStatus: (id: string, status: PersonalStatus | null) =>
      updatePersonal(id, (state, now) =>
        state.status === status ? state : { ...state, status, statusSince: status ? now : null },
      ),
    setFocusMode: (id: string, focusMode: boolean) =>
      updatePersonal(id, (state) => (state.focusMode === focusMode ? state : { ...state, focusMode })),

    dismissWriteError() {
      if (snapshot.writeFailed) emit({ ...snapshot, writeFailed: false })
    },
  }
}

export type SessionsStore = ReturnType<typeof createSessionsStore>
