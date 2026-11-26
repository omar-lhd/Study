/**
 * Pure Phase 2 timing and governance policies.
 * These helpers are deterministic and intentionally separate from UI state.
 */

export type SharedTimerStatus = 'scheduled' | 'active' | 'paused' | 'completed' | 'canceled'

export interface SharedTimerSnapshot {
  status: SharedTimerStatus
  plannedDurationSeconds: number
  accumulatedStudySeconds: number
  runningSince: string | null
  serverNow: string
}

/** Elapsed time is derived exclusively from the backend snapshot timestamps. */
export function sharedElapsedSeconds(snapshot: SharedTimerSnapshot, serverNowMs: number): number {
  const accumulated = Math.max(0, snapshot.accumulatedStudySeconds)
  const runningSinceMs = snapshot.runningSince ? Date.parse(snapshot.runningSince) : Number.NaN
  const currentSegment = snapshot.status === 'active' && Number.isFinite(runningSinceMs)
    ? Math.max(0, Math.floor((serverNowMs - runningSinceMs) / 1000))
    : 0
  return Math.min(snapshot.plannedDurationSeconds, accumulated + currentSegment)
}

export function sharedRemainingSeconds(snapshot: SharedTimerSnapshot, serverNowMs: number): number {
  return Math.max(0, snapshot.plannedDurationSeconds - sharedElapsedSeconds(snapshot, serverNowMs))
}

/** Project server time onto a local clock between authoritative snapshots. */
export function estimatedServerNow(snapshot: SharedTimerSnapshot, localNowMs: number): number {
  const serverAtSync = Date.parse(snapshot.serverNow)
  return Number.isFinite(serverAtSync) ? serverAtSync + Math.max(0, localNowMs - serverAtSync) : localNowMs
}

export interface PauseVotePolicy {
  electorate: readonly string[]
  votes: Readonly<Record<string, 'yes' | 'no'>>
  expiresAt: number
}

/**
 * The electorate is snapshotted when requested. A strict majority means
 * greater than half of that frozen electorate. This is a provisional policy
 * pending explicit product decisions around membership churn and expiration.
 */
export function pauseVoteResult(policy: PauseVotePolicy, nowMs: number): 'pending' | 'approved' | 'rejected' | 'expired' {
  if (nowMs >= policy.expiresAt) return 'expired'
  const eligible = new Set(policy.electorate)
  const counted = Object.entries(policy.votes).filter(([userId, vote]) => eligible.has(userId) && (vote === 'yes' || vote === 'no'))
  const yes = counted.filter(([, vote]) => vote === 'yes').length
  const no = counted.filter(([, vote]) => vote === 'no').length
  const majority = Math.floor(eligible.size / 2) + 1
  if (yes >= majority) return 'approved'
  if (no >= majority) return 'rejected'
  return 'pending'
}

export interface SpeakerSeat {
  seatNumber: number
  participantId: string
}

/** Atomic transfer policy model for tests; the database RPC remains authoritative. */
export function transferSpeakerSeat(
  seats: readonly SpeakerSeat[],
  seatNumber: number,
  currentSpeakerParticipantId: string,
  requestingParticipantId: string,
  maximumSeats = 6,
): SpeakerSeat[] {
  if (maximumSeats !== 6) throw new Error('SPEAKER_SEAT_LIMIT_IS_SIX')
  if (requestingParticipantId === currentSpeakerParticipantId) throw new Error('CANNOT_TRANSFER_TO_SAME_PARTICIPANT')
  if (seats.length > maximumSeats) throw new Error('SPEAKER_SEAT_CAP_REACHED')
  const index = seats.findIndex(seat => seat.seatNumber === seatNumber && seat.participantId === currentSpeakerParticipantId)
  if (index < 0) throw new Error('SPEAKER_SEAT_ALREADY_RELEASED')
  if (seats.some(seat => seat.participantId === requestingParticipantId)) throw new Error('ALREADY_SPEAKER')
  const next = seats.slice()
  next[index] = { seatNumber, participantId: requestingParticipantId }
  if (new Set(next.map(seat => seat.seatNumber)).size !== next.length || new Set(next.map(seat => seat.participantId)).size !== next.length) {
    throw new Error('SPEAKER_SEAT_INTEGRITY_VIOLATION')
  }
  return next
}

export interface SoloTimerState {
  status: 'active' | 'paused' | 'completed'
  accumulatedMs: number
  runningSince: number | null
}

/** Persist an elapsed Solo snapshot before opening a group room; never discards it. */
export function suspendSoloForGroupJoin(solo: SoloTimerState, nowMs: number): SoloTimerState {
  if (solo.status !== 'active' || solo.runningSince === null) return solo
  return {
    status: 'paused',
    accumulatedMs: solo.accumulatedMs + Math.max(0, nowMs - solo.runningSince),
    runningSince: null,
  }
}
