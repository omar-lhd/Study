'use client'

import { cloudRest, getValidCloudSession } from '@/lib/chats/cloud-client'

export interface InAppNotification {
  id:string
  recipient_id:string
  actor_id:string|null
  notification_type:string
  payload:Record<string,unknown>
  read_at:string|null
  created_at:string
}
export interface SessionNotificationPreferences {
  user_id:string
  notify_session_starts:boolean
  notify_session_invites:boolean
  updated_at:string
}

export async function listMyInAppNotifications(){
  const session=await getValidCloudSession()
  return cloudRest<InAppNotification[]>(
    'in_app_notifications?recipient_id=eq.'+encodeURIComponent(session.user.id)+'&select=id,recipient_id,actor_id,notification_type,payload,read_at,created_at&order=created_at.desc&limit=100'
  )
}

export async function markMyNotificationRead(notificationId:string){
  const session=await getValidCloudSession()
  return cloudRest<InAppNotification[]>(
    'in_app_notifications?id=eq.'+encodeURIComponent(notificationId)+'&recipient_id=eq.'+encodeURIComponent(session.user.id),
    {method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({read_at:new Date().toISOString()})}
  )
}

export async function getMySessionNotificationPreferences(){
  const session=await getValidCloudSession()
  const rows=await cloudRest<SessionNotificationPreferences[]>(
    'study_session_notification_preferences?user_id=eq.'+encodeURIComponent(session.user.id)+'&select=user_id,notify_session_starts,notify_session_invites,updated_at&limit=1'
  )
  return rows[0]??{user_id:session.user.id,notify_session_starts:true,notify_session_invites:true,updated_at:new Date().toISOString()}
}

export async function saveMySessionNotificationPreferences(input:Pick<SessionNotificationPreferences,'notify_session_starts'|'notify_session_invites'>){
  const session=await getValidCloudSession()
  return cloudRest<SessionNotificationPreferences[]>(
    'study_session_notification_preferences?on_conflict=user_id',
    {method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({...input,user_id:session.user.id,updated_at:new Date().toISOString()})}
  )
}
