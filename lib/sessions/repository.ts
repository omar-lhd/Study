import type { PersonalState, StudySession } from './types'

/**
 * Storage boundary for Group Sessions. The UI and the store only depend on this
 * interface, so a Supabase/Realtime adapter can replace the local one without
 * touching components. Personal state (status, focus mode) is device-level and
 * should stay local even after a shared backend exists.
 */
export interface SessionsRepository {
  list(): Promise<StudySession[]>
  saveSession(session: StudySession): Promise<void>
  loadPersonal(): Promise<Record<string, PersonalState>>
  savePersonal(sessionId: string, state: PersonalState): Promise<void>
  /** Called when the data changed outside this store (another tab, or a remote adapter). */
  subscribe(onExternalChange: () => void): () => void
}

export class SessionsStorageError extends Error {
  constructor(
    public readonly kind: 'read' | 'write',
    cause?: unknown,
  ) {
    super(kind === 'read' ? 'Could not read saved sessions' : 'Could not save sessions', { cause })
    this.name = 'SessionsStorageError'
  }
}
