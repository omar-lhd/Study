'use client'

import { cloudRest, getValidCloudSession } from '@/lib/chats/cloud-client'
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
  resume_at: string | null
  server_now: string
  host_id: string
  participant_id: string
  is_present: boolean
  allow_audio: boolean
  speaker_seat_count: number
  participant_count: number
}

export interface SharedSessionCreateInput {
  communityId: string
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

export async function listMyStudyCommunities() {
  const {user}=await import('@/lib/chats/cloud-client').then(module=>({user:module.readCloudSession()?.user}))
  if(!user?.id) throw new Error('AUTH_REQUIRED')
  const memberships=await cloudRest<Array<{group_id:string}>>(
    `group_members?user_id=eq.${encodeURIComponent(user.id)}&select=group_id&order=joined_at.asc`
  )
  const groupIds=[...new Set(memberships.map(item=>item.group_id))]
  if(!groupIds.length)return []
  return cloudRest<Array<{id:string;name:string;created_by:string}>>(
    `study_groups?id=in.(${groupIds.map(encodeURIComponent).join(',')})&select=id,name,created_by&order=created_at.asc`
  )
}

export async function listCommunityMemberProfiles(groupId:string) {
  const memberships=await cloudRest<Array<{user_id:string}>>(
    `group_members?group_id=eq.${encodeURIComponent(groupId)}&select=user_id&order=joined_at.asc`
  )
  const ids=[...new Set(memberships.map(item=>item.user_id))]
  if (!ids.length) return []
  return cloudRest<Array<{id:string;display_name:string;avatar_url:string|null;username:string|null}>>(
    `profiles?id=in.(${ids.map(encodeURIComponent).join(',')})&select=id,display_name,avatar_url,username`
  )
}

export async function listVisibleSharedStudySessions(groupId:string) {
  return cloudRest<Array<{
    id:string;title:string;subject:string|null;subject_color:string|null;session_type:SharedSessionSnapshot['session_type'];
    status:SharedSessionSnapshot['status'];access_type:SharedSessionSnapshot['access_type'];starts_at:string|null;
    started_at:string|null;ended_at:string|null;planned_duration_seconds:number;created_at:string;host_id:string;created_by:string;group_id:string
  }>>(
    `study_sessions?group_id=eq.${encodeURIComponent(groupId)}&access_type=eq.group&select=id,title,subject,subject_color,session_type,status,access_type,starts_at,started_at,ended_at,planned_duration_seconds,created_at,host_id,created_by,group_id&order=starts_at.asc.nullslast,created_at.desc`
  )
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
  const result = await cloudRest<unknown>('rpc/create_study_session', {
    method: 'POST',
    body: JSON.stringify({
      p_group_id: input.communityId,
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
  if(typeof result==='string')return result
  if(result&&typeof result==='object'){
    const row=result as Record<string,unknown>
    const id=row.id??row.session_id??row.create_study_session
    if(typeof id==='string'&&id.length>0)return id
  }
  throw new Error('SESSION_CREATE_INVALID_RESPONSE')
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

export async function expireSharedSessionVotes(sessionId:string) {
 return cloudRest<number>('rpc/expire_study_session_votes',{method:'POST',body:JSON.stringify({p_session_id:sessionId})})
}
export async function cleanupSharedSessionPresence(sessionId:string) {
 return cloudRest<number>('rpc/cleanup_stale_study_session_presence',{method:'POST',body:JSON.stringify({p_session_id:sessionId})})
}
export async function completeExpiredSharedStudySession(sessionId:string) {
  return cloudRest<boolean>('rpc/complete_expired_study_session',{
    method:'POST',body:JSON.stringify({p_session_id:sessionId})
  })
}

export type PersonalSessionStatus='coffee'|'restroom'|'quick_talk'|null
export async function setMySessionPersonalStatus(sessionId:string,status:PersonalSessionStatus) {
  return cloudRest('rpc/set_my_session_personal_status',{
    method:'POST',body:JSON.stringify({p_session_id:sessionId,p_status:status})
  })
}

export async function getSharedStudySessionSnapshot(sessionId: string) {
  return cloudRest<SharedSessionSnapshot>('rpc/get_study_session_snapshot',{
    method:'POST',body:JSON.stringify({p_session_id:sessionId})
  })
}

export async function requestSharedSessionResume(sessionId:string) {
  return cloudRest<string>('rpc/request_study_session_resume',{
    method:'POST',body:JSON.stringify({p_session_id:sessionId})
  })
}

export async function completeSharedSessionResume(sessionId:string) {
  return cloudRest<boolean>('rpc/complete_study_session_resume',{
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


export async function getCloudCurrentUser() {
  const session = await import('@/lib/chats/cloud-client').then(module => module.readCloudSession())
  return session?.user.id ?? null
}

export async function listMySharedSessions() {
  return cloudRest<Array<{
    id:string;title:string;subject:string|null;subject_color:string|null;session_type:SharedSessionSnapshot['session_type'];
    status:SharedSessionSnapshot['status'];access_type:SharedSessionSnapshot['access_type'];starts_at:string|null;
    started_at:string|null;ended_at:string|null;planned_duration_seconds:number;created_at:string;host_id:string;
    created_by:string;group_id:string;participant_count:number;
  }>>('rpc/list_visible_shared_study_sessions',{method:'POST',body:'{}'})
}

export async function getSharedSessionSummary(sessionId:string) {
  return cloudRest<SharedSessionSnapshot>('rpc/get_study_session_snapshot',{method:'POST',body:JSON.stringify({p_session_id:sessionId})})
}

export async function listSharedSessionMessages(sessionId:string) {
  return cloudRest<Array<{id:string;sender_id:string;content:string;client_event_id:string;created_at:string}>>(
    `study_session_chat?session_id=eq.${encodeURIComponent(sessionId)}&select=*&order=created_at.asc&limit=100`
  )
}

export async function listSharedSpeakerSeats(sessionId:string) {
 return cloudRest<Array<{seat_number:number;participant_id:string;participant:{user_id:string;profiles:{display_name:string;avatar_url:string|null}|null}}>>(
   `study_session_speaker_seats?session_id=eq.${encodeURIComponent(sessionId)}&select=seat_number,participant_id,participant:study_session_participants(user_id,profiles(display_name,avatar_url))&order=seat_number.asc`
 )
}

export async function setMyFocusMode(sessionId:string,focus:boolean) {
 const session=await getValidCloudSession()
 return cloudRest('study_session_participants?session_id=eq.'+encodeURIComponent(sessionId)+'&user_id=eq.'+encodeURIComponent(session.user.id)+'&select=id', {
   method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({focus_mode:focus,updated_at:new Date().toISOString()})
 })
}

export interface LiveSessionParticipant {
  id: string
  user_id: string
  participant_role: 'host' | 'moderator' | 'member'
  attendance_state: 'invited' | 'present' | 'left' | 'suspended'
  focus_mode: boolean
  whiteboard_open,personal_status: boolean; personal_status?: 'coffee'|'restroom'|'quick_talk'|null
  personal_status: PersonalSessionStatus
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
    attendance_state:LiveSessionParticipant['attendance_state'];focus_mode:boolean;whiteboard_open,personal_status:boolean;personal_status:PersonalSessionStatus;
  }>>(
    `study_session_participants?session_id=eq.${encodeURIComponent(sessionId)}&select=id,user_id,participant_role,attendance_state,focus_mode,whiteboard_open,personal_status&order=created_at.asc`
  )
  const ids = [...new Set(rows.map(row=>row.user_id))]
  const profiles = ids.length ? await cloudRest<Array<{id:string;display_name:string;avatar_url:string|null}>>(
    `profiles?id=in.(${ids.map(encodeURIComponent).join(',')})&select=id,display_name,avatar_url`
  ) : []
  const byId = new Map(profiles.map(profile=>[profile.id,profile]))
  return rows.map(row=>({
    id:row.id,user_id:row.user_id,participant_role:row.participant_role,
    attendance_state:row.attendance_state,focus_mode:row.focus_mode,whiteboard_open,personal_status:row.whiteboard_open,personal_status:row.personal_status,
    display_name:byId.get(row.user_id)?.display_name ?? 'Study member',
    avatar_url:byId.get(row.user_id)?.avatar_url ?? null
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
  return cloudRest<Array<{id:string;sender_id:string;content:string;client_event_id:string;created_at:string;message_type?:'text'|'image';storage_path?:string|null;doodle_path?:string|null}>>(
    `study_session_chat?session_id=eq.${encodeURIComponent(sessionId)}&select=*&order=created_at.asc&limit=200`
  )
}

export async function sendSharedSessionImage(sessionId:string,senderId:string,file:File,clientEventId:string){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('UNSUPPORTED_IMAGE_TYPE')
  if(file.size>12*1024*1024)throw new Error('SESSION_IMAGE_TOO_LARGE')
  const session=await getValidCloudSession()
  const base=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,'')
  const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if(!base||!key)throw new Error('SUPABASE_ENV_NOT_CONFIGURED')
  const ext=file.type==='image/jpeg'?'jpg':file.type==='image/png'?'png':'webp'
  const path=`${sessionId}/${senderId}/${crypto.randomUUID()}.${ext}`
  const headers={apikey:key,Authorization:`Bearer ${session.access_token}`}
  const upload=await fetch(base+'/storage/v1/object/study-session-chat/'+path.split('/').map(encodeURIComponent).join('/'),{
    method:'POST',headers:{...headers,'Content-Type':file.type,'x-upsert':'false'},body:file
  })
  if(!upload.ok)throw new Error('SESSION_IMAGE_UPLOAD_FAILED')
  try{
    return await cloudRest<unknown>('study_session_chat',{
      method:'POST',headers:{Prefer:'return=representation'},
      body:JSON.stringify({session_id:sessionId,sender_id:senderId,content:'',client_event_id:clientEventId,message_type:'image',storage_path:path})
    })
  }catch(error){
    // Remove the private object if the database insert fails.
    await fetch(base+'/storage/v1/object/study-session-chat',{method:'DELETE',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[path]})}).catch(()=>{})
    throw error
  }
}

export async function getSharedSessionImageUrl(path:string,expiresIn=900){
  const session=await getValidCloudSession()
  const base=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,'')
  const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if(!base||!key)throw new Error('SUPABASE_ENV_NOT_CONFIGURED')
  const response=await fetch(base+'/storage/v1/object/sign/study-session-chat/'+path.split('/').map(encodeURIComponent).join('/'),{
    method:'POST',headers:{apikey:key,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
    body:JSON.stringify({expiresIn})
  })
  const result=await response.json() as {signedURL?:string}
  if(!response.ok||!result.signedURL)throw new Error('SESSION_IMAGE_URL_FAILED')
  return result.signedURL.startsWith('http')?result.signedURL:base+result.signedURL
}

export async function saveSharedSessionImageDoodle(sessionId:string,messageId:string,doodlePath:string){
  return cloudRest('study_session_chat?id=eq.'+encodeURIComponent(messageId),{
    method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({doodle_path:doodlePath})
  })
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
    `study_session_pause_requests?session_id=eq.${encodeURIComponent(sessionId)}&status=eq.pending&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*&order=created_at.desc`
  )
}

export async function listSharedSessionSeatRequests(sessionId:string) {
  return cloudRest<Array<{id:string;requester_id:string;target_participant_id:string;status:string;expires_at:string;created_at:string}>>(
    `study_session_seat_requests?session_id=eq.${encodeURIComponent(sessionId)}&status=eq.pending&select=*&order=created_at.asc`
  )
}

export interface SessionEvent {
  id:string
  actor_id:string|null
  event_type:string
  payload:Record<string,unknown>
  occurred_at:string
}
export interface SessionPauseRequest {
  id:string
  requested_by:string
  status:string
  yes_count:number
  no_count:number
  expires_at:string
  electorate:string[]
}
export interface SessionTimeChangeRequest {
  id:string
  session_id:string
  requested_by:string
  delta_seconds:number
  proposed_duration_seconds:number
  electorate:string[]
  yes_count:number
  no_count:number
  status:string
  expires_at:string
  created_at:string
}
export interface WhiteboardPage {
  id:string
  session_id:string
  page_index:number
  settings:Record<string,unknown>
  updated_by:string|null
  updated_at:string
}
export interface WhiteboardElement {
  id:string
  session_id:string
  page_index:number
  created_by:string
  element_type:'stroke'|'text'|'shape'|'image'
  data:Record<string,unknown>
  created_at:string
  updated_at:string
  deleted_at:string|null
}

export async function listSharedSessionEvents(sessionId:string) {
  return cloudRest<SessionEvent[]>(
    `study_session_events?session_id=eq.${encodeURIComponent(sessionId)}&select=id,actor_id,event_type,payload,occurred_at&order=occurred_at.desc&limit=100`
  )
}



export async function listSharedSessionTimeChangeRequests(sessionId:string) {
  return cloudRest<SessionTimeChangeRequest[]>(
    `study_session_time_change_requests?session_id=eq.${encodeURIComponent(sessionId)}&status=eq.pending&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*&order=created_at.desc`
  )
}

export async function proposeSharedSessionTimeChange(sessionId:string,deltaSeconds:number) {
  return cloudRest<string>('rpc/propose_session_time_change',{
    method:'POST',body:JSON.stringify({p_session_id:sessionId,p_delta_seconds:deltaSeconds})
  })
}

export async function voteSharedSessionTimeChange(requestId:string,vote:'yes'|'no') {
  return cloudRest<string>('rpc/vote_session_time_change',{
    method:'POST',body:JSON.stringify({p_request_id:requestId,p_vote:vote})
  })
}

export async function getSharedWhiteboardPage(sessionId:string,pageIndex:number) {
  const rows=await cloudRest<WhiteboardPage[]>(
    `study_session_whiteboard_pages?session_id=eq.${encodeURIComponent(sessionId)}&page_index=eq.${pageIndex}&select=id,session_id,page_index,settings,updated_by,updated_at&limit=1`
  )
  return rows[0]??null
}

export async function saveSharedWhiteboardPage(sessionId:string,pageIndex:number,settings:Record<string,unknown>,userId:string) {
  return cloudRest<WhiteboardPage[]>(
    `study_session_whiteboard_pages?on_conflict=session_id,page_index`,
    {method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({session_id:sessionId,page_index:pageIndex,settings,updated_by:userId,updated_at:new Date().toISOString()})}
  )
}

export async function listSharedWhiteboardElements(sessionId:string,pageIndex:number) {
  return cloudRest<WhiteboardElement[]>(
    `study_session_whiteboard_elements?session_id=eq.${encodeURIComponent(sessionId)}&page_index=eq.${pageIndex}&deleted_at=is.null&select=*&order=created_at.asc&limit=1500`
  )
}

export async function addSharedWhiteboardElement(sessionId:string,pageIndex:number,userId:string,elementType:WhiteboardElement['element_type'],data:Record<string,unknown>) {
  return cloudRest<WhiteboardElement[]>(
    'study_session_whiteboard_elements',
    {method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({session_id:sessionId,page_index:pageIndex,created_by:userId,element_type:elementType,data})}
  )
}

export async function updateSharedWhiteboardElement(elementId:string,data:Record<string,unknown>) {
  return cloudRest<WhiteboardElement[]>(
    `study_session_whiteboard_elements?id=eq.${encodeURIComponent(elementId)}`,
    {method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({data,updated_at:new Date().toISOString()})}
  )
}

export async function deleteSharedWhiteboardElement(elementId:string) {
  return cloudRest<undefined>(`study_session_whiteboard_elements?id=eq.${encodeURIComponent(elementId)}`,{method:'DELETE'})
}

export interface AgoraRtcTokenResponse {
  appId:string
  channelName:string
  uid:number
  token:string
  expiresIn:number
  role:'listen'|'publish_audio'
  audioOnly:true
  seatNumber:number|null
}

export async function getAgoraRtcToken(sessionId:string,intent:'listen'|'publish_audio') {
  const session=await getValidCloudSession()
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,'')
  const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if(!url||!key)throw new Error('SUPABASE_ENV_NOT_CONFIGURED')
  const response=await fetch(`${url}/functions/v1/agora-rtc-token`,{
    method:'POST',
    headers:{apikey:key,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
    body:JSON.stringify({sessionId,intent})
  })
  const data=await response.json().catch(()=>({})) as AgoraRtcTokenResponse&{error?:string}
  if(!response.ok)throw new Error(data.error||'AGORA_TOKEN_REQUEST_FAILED')
  return data
}


/** Subscribe to session table changes through Supabase Realtime without adding a second client SDK. */
export function subscribeSharedSessionRealtime(sessionId:string,onChange:()=>void){
  let active=true
  let socket:WebSocket|null=null
  let reconnectDelay=1000
  let reconnectTimer:number|undefined
  let heartbeatTimer:number|undefined
  let tokenTimer:number|undefined
  let ref=1
  const topic=`realtime:study-session-${sessionId}`
  const clearSocketTimers=()=>{
    if(heartbeatTimer!==undefined)window.clearInterval(heartbeatTimer)
    if(tokenTimer!==undefined)window.clearInterval(tokenTimer)
    heartbeatTimer=undefined
    tokenTimer=undefined
  }
  const send=(message:Record<string,unknown>)=>{
    if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message))
  }
  const connect=async()=>{
    if(!active)return
    try{
      const session=await getValidCloudSession()
      const base=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,'')
      const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if(!base||!key)throw new Error('SUPABASE_ENV_NOT_CONFIGURED')
      const wsUrl=base.replace(/^https:/,'wss:').replace(/^http:/,'ws:')+'/realtime/v1/websocket'
      const url=new URL(wsUrl)
      url.searchParams.set('apikey',key)
      url.searchParams.set('vsn','1.0.0')
      socket=new WebSocket(url.toString())
      socket.onopen=()=>{
        if(!active||!socket)return
        reconnectDelay=1000
        const tables=[
          {table:'study_sessions',filter:'id=eq.'+sessionId},
          {table:'study_session_participants',filter:'session_id=eq.'+sessionId},
          {table:'study_session_devices',filter:'session_id=eq.'+sessionId},
          {table:'study_session_speaker_seats',filter:'session_id=eq.'+sessionId},
          {table:'study_session_seat_requests',filter:'session_id=eq.'+sessionId},
          {table:'study_session_pause_requests',filter:'session_id=eq.'+sessionId},
          {table:'study_session_pause_votes'},
          {table:'study_session_time_change_requests',filter:'session_id=eq.'+sessionId},
          {table:'study_session_time_change_votes'},
          {table:'study_session_whiteboard_pages',filter:'session_id=eq.'+sessionId},
          {table:'study_session_whiteboard_elements',filter:'session_id=eq.'+sessionId},
          {table:'study_session_events',filter:'session_id=eq.'+sessionId},
          {table:'study_session_chat',filter:'session_id=eq.'+sessionId},
          {table:'study_session_goals',filter:'session_id=eq.'+sessionId},
          {table:'study_session_notes',filter:'session_id=eq.'+sessionId},
          {table:'study_session_invitations',filter:'session_id=eq.'+sessionId},
          {table:'study_session_files',filter:'session_id=eq.'+sessionId},
          {table:'study_session_intervals',filter:'session_id=eq.'+sessionId}
        ]
        send({
          topic,event:'phx_join',ref:String(ref),join_ref:String(ref),
          payload:{
            config:{
              broadcast:{ack:false,self:false},
              presence:{key:session.user.id},
              postgres_changes:tables.map(item=>({event:'*',schema:'public',table:item.table,...(item.filter?{filter:item.filter}:{})}))
            },
            access_token:session.access_token
          }
        })
        ref++
        heartbeatTimer=window.setInterval(()=>send({topic:'phoenix',event:'heartbeat',payload:{},ref:String(ref++)}),25000)
        tokenTimer=window.setInterval(()=>void getValidCloudSession().then(next=>send({topic,event:'access_token',payload:{access_token:next.access_token},ref:String(ref++)})).catch(()=>{}),240000)
      }
      socket.onmessage=event=>{
        try{
          const message=JSON.parse(String(event.data)) as {event?:string;payload?:{status?:string};ref?:string}
          if(message.event==='postgres_changes'||message.event==='presence_diff'||message.event==='broadcast')onChange()
          if(message.event==='phx_reply'&&message.payload?.status==='error')onChange()
        }catch{/* Ignore malformed socket frames; the next database refresh remains authoritative. */}
      }
      socket.onerror=()=>{onChange()}
      socket.onclose=()=>{
        clearSocketTimers()
        if(!active)return
        reconnectTimer=window.setTimeout(()=>{void connect()},reconnectDelay)
        reconnectDelay=Math.min(15000,reconnectDelay*2)
      }
    }catch{
      if(!active)return
      reconnectTimer=window.setTimeout(()=>{void connect()},reconnectDelay)
      reconnectDelay=Math.min(15000,reconnectDelay*2)
    }
  }
  void connect()
  return()=>{
    active=false
    clearSocketTimers()
    if(reconnectTimer!==undefined)window.clearTimeout(reconnectTimer)
    socket?.close()
    socket=null
  }
}

export async function setMyWhiteboardPresence(sessionId:string,open:boolean) {
  const session=await getValidCloudSession()
  return cloudRest('study_session_participants?session_id=eq.'+encodeURIComponent(sessionId)+'&user_id=eq.'+encodeURIComponent(session.user.id),{
    method:'PATCH',headers:{Prefer:'return=representation'},
    body:JSON.stringify({whiteboard_open,personal_status:open,updated_at:new Date().toISOString()})
  })
}
