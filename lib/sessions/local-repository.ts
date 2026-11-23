import { SessionsStorageError, type SessionsRepository } from './repository'
import type { PersonalState, SessionGoal, StudySession } from './types'

const SESSIONS_KEY = 'psc:study-sessions:v1'
const PERSONAL_KEY = 'psc:study-sessions-personal:v1'

const STATUSES = ['scheduled', 'active', 'paused', 'completed']
const MODES = ['instant', 'scheduled']
const VISIBILITIES = ['private', 'friends', 'open']
const PERSONAL_STATUSES = ['coffee', 'restroom', 'quickTalk']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isNumberOrNull = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isFinite(value))

function parseGoal(value: unknown): SessionGoal | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || typeof value.text !== 'string' || typeof value.done !== 'boolean') return null
  return { id: value.id, text: value.text, done: value.done }
}

function parseSession(value: unknown): StudySession | null {
  if (!isRecord(value)) return null
  const v = value
  if (
    typeof v.id !== 'string' ||
    typeof v.title !== 'string' ||
    typeof v.durationMinutes !== 'number' ||
    !Number.isFinite(v.durationMinutes) ||
    typeof v.status !== 'string' ||
    !STATUSES.includes(v.status) ||
    typeof v.mode !== 'string' ||
    !MODES.includes(v.mode) ||
    typeof v.visibility !== 'string' ||
    !VISIBILITIES.includes(v.visibility) ||
    !isNumberOrNull(v.scheduledFor) ||
    !isNumberOrNull(v.startedAt) ||
    !isNumberOrNull(v.runningSince) ||
    !isNumberOrNull(v.endedAt) ||
    typeof v.accumulatedMs !== 'number' ||
    typeof v.createdAt !== 'number' ||
    typeof v.updatedAt !== 'number'
  ) {
    return null
  }
  const goals = Array.isArray(v.goals)
    ? v.goals.map(parseGoal).filter((goal): goal is SessionGoal => goal !== null)
    : []
  return {
    id: v.id,
    title: v.title,
    subject: typeof v.subject === 'string' ? v.subject : '',
    description: typeof v.description === 'string' ? v.description : '',
    durationMinutes: v.durationMinutes,
    visibility: v.visibility as StudySession['visibility'],
    mode: v.mode as StudySession['mode'],
    scheduledFor: v.scheduledFor,
    status: v.status as StudySession['status'],
    createdAt: v.createdAt,
    startedAt: v.startedAt,
    accumulatedMs: v.accumulatedMs,
    runningSince: v.runningSince,
    endedAt: v.endedAt,
    goals,
    notes: typeof v.notes === 'string' ? v.notes : '',
    updatedAt: v.updatedAt,
  }
}

function parsePersonal(value: unknown): PersonalState | null {
  if (!isRecord(value)) return null
  const status =
    typeof value.status === 'string' && PERSONAL_STATUSES.includes(value.status)
      ? (value.status as PersonalState['status'])
      : null
  return {
    status,
    statusSince: status && typeof value.statusSince === 'number' ? value.statusSince : null,
    focusMode: value.focusMode === true,
    joinedAt: typeof value.joinedAt === 'number' ? value.joinedAt : null,
  }
}

function readJson(key: string): unknown {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(key)
  } catch (error) {
    throw new SessionsStorageError('read', error)
  }
  if (raw === null) return null
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new SessionsStorageError('read', error)
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    throw new SessionsStorageError('write', error)
  }
}

/**
 * Device-local adapter. Data is NOT shared between users or devices; it only
 * survives refreshes in this browser profile.
 */
export const localSessionsRepository: SessionsRepository = {
  async list() {
    const data = readJson(SESSIONS_KEY)
    if (!Array.isArray(data)) return []
    return data.map(parseSession).filter((session): session is StudySession => session !== null)
  },

  async saveSession(session) {
    const data = readJson(SESSIONS_KEY)
    const existing = Array.isArray(data)
      ? data.map(parseSession).filter((item): item is StudySession => item !== null)
      : []
    const index = existing.findIndex((item) => item.id === session.id)
    if (index === -1) existing.push(session)
    else existing[index] = session
    writeJson(SESSIONS_KEY, existing)
  },

  async loadPersonal() {
    const data = readJson(PERSONAL_KEY)
    const result: Record<string, PersonalState> = {}
    if (!isRecord(data)) return result
    for (const [id, value] of Object.entries(data)) {
      const parsed = parsePersonal(value)
      if (parsed) result[id] = parsed
    }
    return result
  },

  async savePersonal(sessionId, state) {
    const data = readJson(PERSONAL_KEY)
    const current = isRecord(data) ? { ...data } : {}
    current[sessionId] = state
    writeJson(PERSONAL_KEY, current)
  },

  subscribe(onExternalChange) {
    const handler = (event: StorageEvent) => {
      if (event.key === SESSIONS_KEY || event.key === PERSONAL_KEY || event.key === null) onExternalChange()
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  },
}
