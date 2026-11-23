export type SessionStatus = 'scheduled' | 'active' | 'paused' | 'completed'
export type SessionMode = 'instant' | 'scheduled'
/** UI-level setting only. It is stored but not enforced until a backend exists. */
export type SessionVisibility = 'private' | 'friends' | 'open'
export type PersonalStatus = 'coffee' | 'restroom' | 'quickTalk'

export interface SessionGoal {
  id: string
  text: string
  done: boolean
}

export interface StudySession {
  id: string
  title: string
  subject: string
  description: string
  durationMinutes: number
  visibility: SessionVisibility
  mode: SessionMode
  /** Epoch ms of the planned start. Null for instant sessions. */
  scheduledFor: number | null
  status: SessionStatus
  createdAt: number
  /** Epoch ms of the first start. */
  startedAt: number | null
  /** Milliseconds counted before the current running segment. */
  accumulatedMs: number
  /** Epoch ms when the current running segment began. Null while not running. */
  runningSince: number | null
  endedAt: number | null
  goals: SessionGoal[]
  notes: string
  updatedAt: number
}

/** Per-device state. Never part of the shared session and never touches the timer. */
export interface PersonalState {
  status: PersonalStatus | null
  statusSince: number | null
  focusMode: boolean
  joinedAt: number | null
}

export interface CreateSessionInput {
  title: string
  subject: string
  description: string
  durationMinutes: number
  visibility: SessionVisibility
  mode: SessionMode
  scheduledFor: number | null
  goals: string[]
}

export const EMPTY_PERSONAL_STATE: PersonalState = {
  status: null,
  statusSince: null,
  focusMode: false,
  joinedAt: null,
}
