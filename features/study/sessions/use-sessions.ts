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

export interface LiveSessionParticipant {
  id: string
  user_id: string
  participant_role: 'host' | 'moderator' | 'member'
  attendance_state: 'invited' | 'present' | 'left' | 'suspended'
  focus_mode: boolean
  display_name: string
  avatar_url: string | null
}

export interface LiveSessionGoal {
  id: string
  text: string
  completed: boolean
  created_by: string
}

export async function listSharedStudySessions(groupId: string) {
  return cloudRest<Array<Record<string, unknown>>>(
    `study_sessions?group_id=eq.${encodeURIComponent(groupId)}&select=*&order=starts_at.asc.nullslast,created_at.desc`
  )
}

export async function listSharedSessionParticipants(sessionId: string) {
  const rows = await cloudRest<Array<{
    id:string;user_id:string;participant_role:LiveSessionParticipant['participant_role'];
    attendance_state:LiveSessionParticipant['attendance_state'];focus_mode:boolean;
    profiles:{display_name:string;avatar_url:string|null}|null
  }>>(
    `study_session_participants?session_id=eq.${encodeURIComponent(sessionId)}&select=id,user_id,participant_role,attendance_state,focus_mode,profiles(display_name,avatar_url)&order=created_at.asc`
  )
  return rows.map(row=>({
    id:row.id,user_id:row.user_id,participant_role:row.participant_role,
    attendance_state:row.attendance_state,focus_mode:row.focus_mode,
    display_name:row.profiles?.display_name ?? 'Study member',
    avatar_url:row.profiles?.avatar_url ?? null
  }))
}

export async function listSharedSessionGoals(sessionId:string) {
  return cloudRest<LiveSessionGoal[]>(
    `study_session_goals?session_id=eq.${encodeURIComponent(sessionId)}&select=id,text,completed,created_by&order=created_at.asc`
  )
}

export async function addSharedSessionGoal(sessionId:string,text:string,userId:string) {
  return cloudRest<LiveSessionGoal[]>('study_session_goals',{
    method:'POST',headers:{Prefer:'return=representation'},
    body:JSON.stringify({session_id:sessionId,text:text.trim(),created_by:userId})
  })
}

export async function updateSharedSessionGoal(goalId:string,completed:boolean,userId:string) {
  return cloudRest<LiveSessionGoal[]>(`study_session_goals?id=eq.${encodeURIComponent(goalId)}`,{
    method:'PATCH',headers:{Prefer:'return=representation'},
    body:JSON.stringify({completed,completed_by:completed?userId:null,completed_at:completed?new Date().toISOString():null,updated_at:new Date().toISOString()})
  })
}

export async function listSharedSessionNotes(sessionId:string) {
  return cloudRest<Array<{id:string;author_id:string;body:string;note_kind:string;created_at:string;updated_at:string}>>(
    `study_session_notes?session_id=eq.${encodeURIComponent(sessionId)}&select=*&order=created_at.desc`
  )
}

export async function addSharedSessionNote(sessionId:string,authorId:string,body:string,noteKind:'note'|'question'|'answer'|'resource'='note') {
  return cloudRest('study_session_notes',{
    method:'POST',headers:{Prefer:'return=representation'},
    body:JSON.stringify({session_id:sessionId,author_id:authorId,body,note_kind:noteKind})
  })
}

export async function listSharedSessionChat(sessionId:string) {
  return cloudRest<Array<{id:string;sender_id:string;content:string;client_event_id:string;created_at:string}>>(
    `study_session_chat?session_id=eq.${encodeURIComponent(sessionId)}&select=*&order=created_at.asc&limit=200`
  )
}

export async function sendSharedSessionChat(sessionId:string,senderId:string,content:string,clientEventId:string) {
  return cloudRest('study_session_chat',{
    method:'POST',headers:{Prefer:'return=representation'},
    body:JSON.stringify({session_id:sessionId,sender_id:senderId,content:content.trim(),client_event_id:clientEventId})
  })
}

export async function createSharedSessionFileRecord(sessionId:string,uploaderId:string,file:File,storagePath:string) {
  if(file.size>50*1024*1024) throw new Error('SESSION_FILE_TOO_LARGE')
  return cloudRest('study_session_files',{
    method:'POST',headers:{Prefer:'return=representation'},
    body:JSON.stringify({session_id:sessionId,uploader_id:uploaderId,storage_path:storagePath,file_name:file.name,mime_type:file.type||'application/octet-stream',file_size:file.size})
  })
}

export async function getSharedSessionSeatAssignments(sessionId:string) {
  return cloudRest<Array<{seat_number:number;participant_id:string;granted_by:string;participant: {user_id:string;profiles:{display_name:string;avatar_url:string|null}|null}}>>(
    `study_session_speaker_seats?session_id=eq.${encodeURIComponent(sessionId)}&select=seat_number,participant_id,granted_by,participant:study_session_participants(user_id,profiles(display_name,avatar_url))&order=seat_number.asc`
  )
}

export async function listSharedSessionPauseRequests(sessionId:string) {
  return cloudRest<Array<{id:string;requested_by:string;status:string;yes_count:number;no_count:number;expires_at:string;electorate:string[]}>>(
    `study_session_pause_requests?session_id=eq.${encodeURIComponent(sessionId)}&status=eq.pending&select=*&order=created_at.desc`
  )
}

export async function listSharedSessionSeatRequests(sessionId:string) {
  return cloudRest<Array<{id:string;requester_id:string;target_participant_id:string;status:string;expires_at:string;created_at:string}>>(
    `study_session_seat_requests?session_id=eq.${encodeURIComponent(sessionId)}&status=eq.pending&select=*&order=created_at.asc`
  )
}
