'use client'

import { useCallback } from 'react'
import { cloudRest } from '@/lib/chats/cloud-client'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { LOCALE_META } from '@/i18n/config'
import { usePreferences } from '@/components/providers/preferences-provider'
import { localSessionsRepository } from '@/lib/sessions/local-repository'
import { createSessionsStore } from '@/lib/sessions/store'

/** The single place that picks the adapter. Swap it here for a Supabase/Realtime one later. */
export const sessionsStore = createSessionsStore(localSessionsRepository)

export function useSessions() {
  return useSyncExternalStore(sessionsStore.subscribe, sessionsStore.getSnapshot, sessionsStore.getServerSnapshot)
}

export interface SharedSessionSnapshot {
  id: string
  title: string
  subject: string | null
  subject_color: string | null
  session_type: 'private' | 'group' | 'open_room'
  status: 'scheduled' | 'active' | 'paused' | 'completed' | 'canceled'
  access_type: 'creator_only' | 'invited' | 'group'
  starts_at: string | null
  started_at: string | null
  ended_at: string | null
  planned_duration_seconds: number
  accumulated_study_seconds: number
  running_since: string | null
  server_now: string
  host_id: string
  participant_id: string
  is_present: boolean
  allow_audio: boolean
  speaker_seat_count: number
  participant_count: number
}

export interface SharedSessionCreateInput {
  title: string
  subject?: string | null
  subjectColor?: string | null
  description?: string
  sessionType: 'private' | 'group' | 'open_room'
  status: 'scheduled' | 'active'
  accessType: 'creator_only' | 'invited' | 'group'
  startsAt?: string | null
  durationSeconds: number
  invitedUsers?: string[]
  goals?: string[]
}

const DEVICE_KEY = 'psc:study-session-device:v1'

function studySessionDeviceId(): string {
  if (typeof window === 'undefined') return 'server-side-device-id'
  let id = window.localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    window.localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

export async function createSharedStudySession(input: SharedSessionCreateInput): Promise<string> {
  const result = await cloudRest<string>('rpc/create_study_session', {
    method: 'POST',
    body: JSON.stringify({
      p_title: input.title.trim(),
      p_subject: input.subject?.trim() || null,
      p_subject_color: input.subjectColor ?? null,
      p_description: input.description ?? '',
      p_session_type: input.sessionType,
      p_status: input.status,
      p_access_type: input.accessType,
      p_starts_at: input.startsAt ?? null,
      p_duration_seconds: input.durationSeconds,
      p_invited_users: input.invitedUsers ?? [],
      p_goals: input.goals ?? [],
    }),
  })
  return result
}

export async function joinSharedStudySession(sessionId: string) {
  return cloudRest<{participant_id:string;status:SharedSessionSnapshot['status'];started_at:string|null;running_since:string|null;accumulated_study_seconds:number;planned_duration_seconds:number}>(
    'rpc/join_study_session',
    {method:'POST',body:JSON.stringify({p_session_id:sessionId,p_device_id:studySessionDeviceId()})}
  )
}

export async function leaveSharedStudySession(sessionId: string) {
  return cloudRest<undefined>('rpc/leave_study_session',{
    method:'POST',body:JSON.stringify({p_session_id:sessionId,p_device_id:studySessionDeviceId()})
  })
}

export async function heartbeatSharedStudySession(sessionId: string) {
  return cloudRest<undefined>('rpc/heartbeat_study_session',{
    method:'POST',body:JSON.stringify({p_session_id:sessionId,p_device_id:studySessionDeviceId()})
  })
}

export async function getSharedStudySessionSnapshot(sessionId: string) {
  return cloudRest<SharedSessionSnapshot>('rpc/get_study_session_snapshot',{
    method:'POST',body:JSON.stringify({p_session_id:sessionId})
  })
}

export async function setSharedStudySessionState(sessionId: string, action:'start'|'pause'|'resume'|'complete'|'cancel') {
  return cloudRest<unknown>('rpc/set_study_session_state',{
    method:'POST',body:JSON.stringify({p_session_id:sessionId,p_action:action})
  })
}

export async function requestSharedPause(sessionId: string) {
  return cloudRest<string>('rpc/request_session_pause',{method:'POST',body:JSON.stringify({p_session_id:sessionId})})
}

export async function voteSharedPause(requestId: string, vote:'yes'|'no') {
  return cloudRest<string>('rpc/vote_session_pause',{method:'POST',body:JSON.stringify({p_request_id:requestId,p_vote:vote})})
}

export async function requestSharedSpeakerSeat(sessionId:string,targetUserId:string) {
  return cloudRest<string>('rpc/request_speaker_seat',{method:'POST',body:JSON.stringify({p_session_id:sessionId,p_target_user:targetUserId})})
}

export async function respondSharedSpeakerSeat(requestId:string,accept:boolean) {
  return cloudRest<string>('rpc/respond_speaker_seat_request',{method:'POST',body:JSON.stringify({p_request_id:requestId,p_accept:accept})})
}

export async function addSharedSpeakerSeat(sessionId:string,userId:string) {
  return cloudRest<number>('rpc/add_session_speaker_seat',{method:'POST',body:JSON.stringify({p_session_id:sessionId,p_user_id:userId})})
}

export async function releaseSharedSpeakerSeat(sessionId:string) {
  return cloudRest<undefined>('rpc/release_speaker_seat',{method:'POST',body:JSON.stringify({p_session_id:sessionId})})
}

export async function respondSharedSessionInvitation(sessionId:string,accept:boolean) {
  return cloudRest<string>('rpc/respond_study_session_invitation',{method:'POST',body:JSON.stringify({p_session_id:sessionId,p_accept:accept})})
}

export async function listMyPendingSharedSessionInvitations() {
  return cloudRest<Array<{invitation_id:string;session_id:string;title:string;session_type:string;subject:string|null;starts_at:string|null;planned_duration_seconds:number;inviter_id:string;inviter_name:string|null;created_at:string}>>(
    'rpc/get_my_pending_session_invitations',{method:'POST',body:'{}'}
  )
}

/** Current time in ms, refreshed on an interval. Only render time-dependent UI once data is ready (client-only). */
export function useNow(intervalMs: number, enabled = true) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs, enabled])
  return now
}

export function useSessionFormatters() {
  const { locale, t } = usePreferences()
  return useMemo(() => {
    const intl = LOCALE_META[locale].intl
    const dateTime = new Intl.DateTimeFormat(intl, { dateStyle: 'medium', timeStyle: 'short' })
    const time = new Intl.DateTimeFormat(intl, { timeStyle: 'short' })
    return {
      dateTime: (ms: number) => dateTime.format(ms),
      time: (ms: number) => time.format(ms),
      minutesLabel: (minutes: number) => t('sessions.meta.minutes', { minutes }),
    }
  }, [locale, t])
}
