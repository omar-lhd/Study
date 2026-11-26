'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, BellRing, CalendarClock, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/headers'
import { EmptyState } from '@/components/ui/states'
import { useT } from '@/components/providers/preferences-provider'
import { cn } from '@/lib/utils'
import {
  getMySessionNotificationPreferences,listMyInAppNotifications,markMyNotificationRead,
  saveMySessionNotificationPreferences,type InAppNotification,type SessionNotificationPreferences
} from './use-notifications'
import type { MessageKey } from '@/i18n/messages/ar'

const TYPES:MessageKey[]=[
 'notifications.type.privateMessages','notifications.type.groupMessages','notifications.type.studyRooms',
 'notifications.type.calls','notifications.type.stories','notifications.type.reminders',
 'notifications.type.achievements','notifications.type.prayer'
]

function payloadText(notification:InAppNotification,key:string,fallback:string){
 const value=notification.payload[key]
 return typeof value==='string'&&value.trim()?value:fallback
}

export function NotificationsView(){
 const {t}=useT()
 const [notifications,setNotifications]=useState<InAppNotification[]>([])
 const [preferences,setPreferences]=useState<SessionNotificationPreferences|null>(null)
 const [tab,setTab]=useState<'inbox'|'preferences'>('inbox')
 const [loading,setLoading]=useState(true)
 const [permission,setPermission]=useState<NotificationPermission>('default')
 const knownIds=useRef<Set<string>>(new Set())
 const firstLoad=useRef(true)

 const refresh=useCallback(async()=>{
  try{
   const [rows,prefs]=await Promise.all([listMyInAppNotifications(),getMySessionNotificationPreferences()])
   if(!firstLoad.current){
    const newRows=rows.filter(row=>!knownIds.current.has(row.id))
    if(document.visibilityState==='hidden'&&typeof Notification!=='undefined'&&Notification.permission==='granted'){
     for(const row of newRows){
      if(row.notification_type!=='study_session_started'&&row.notification_type!=='study_session_created'&&row.notification_type!=='study_session_invitation)continue
      const title=payloadText(row,'title','جلسة مذاكرة')
      const message=payloadText(row,'message','لديك تحديث جديد')
      const notification=new Notification(title,{body:message,tag:row.id})
      notification.onclick=()=>{
       window.focus()
       const sessionId=row.payload.session_id
       if(typeof sessionId==='string')window.location.href='/study/sessions/'+sessionId
       notification.close()
      }
     }
    }
   }
   knownIds.current=new Set(rows.map(row=>row.id))
   firstLoad.current=false
   setNotifications(rows)
   setPreferences(prefs)
  }catch{/* Keep the current inbox visible if the network briefly fails. */}
  finally{setLoading(false)}
 },[])

 useEffect(()=>{
  if(typeof Notification!=='undefined')setPermission(Notification.permission)
  void refresh()
  const timer=window.setInterval(()=>void refresh(),20000)
  const onVisible=()=>{if(document.visibilityState==='visible')void refresh()}
  window.addEventListener('focus',onVisible)
  document.addEventListener('visibilitychange',onVisible)
  return()=>{window.clearInterval(timer);window.removeEventListener('focus',onVisible);document.removeEventListener('visibilitychange',onVisible)}
 },[refresh])

 const updatePreference=async(key:'notify_session_starts'|'notify_session_invites',value:boolean)=>{
  if(!preferences)return
  const next={...preferences,[key]:value}
  setPreferences(next)
  try{await saveMySessionNotificationPreferences({notify_session_starts:next.notify_session_starts,notify_session_invites:next.notify_session_invites})}
  catch{setPreferences(preferences)}
 }
 const requestBrowserPermission=async()=>{
  if(typeof Notification==='undefined')return
  const result=await Notification.requestPermission()
  setPermission(result)
 }
 const openNotification=async(notification:InAppNotification)=>{
  if(!notification.read_at){
   setNotifications(rows=>rows.map(row=>row.id===notification.id?{...row,read_at:new Date().toISOString()}:row))
   void markMyNotificationRead(notification.id).catch(()=>{})
  }
  const sessionId=notification.payload.session_id
  if(typeof sessionId==='string')window.location.href='/study/sessions/'+sessionId
 }

 const unread=notifications.filter(row=>!row.read_at).length
 return <div className="mx-auto max-w-3xl space-y-4">
  <PageHeader title={t('notifications.title')} description={t('notifications.description')}/>
  <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-1">
   <button type="button" onClick={()=>setTab('inbox')} className={tab==='inbox'?'rounded-lg bg-primary/15 px-3 py-2 text-sm font-semibold text-primary':'rounded-lg px-3 py-2 text-sm text-muted-foreground'}>{t('notifications.tab.inbox')} {unread>0?<Badge className="ms-1">{unread}</Badge>:null}</button>
   <button type="button" onClick={()=>setTab('preferences')} className={tab==='preferences'?'rounded-lg bg-primary/15 px-3 py-2 text-sm font-semibold text-primary':'rounded-lg px-3 py-2 text-sm text-muted-foreground'}>{t('notifications.tab.preferences')}</button>
  </div>
  {tab==='inbox'?<div className="space-y-2">
   {loading&&notifications.length===0?<Card><p className="text-sm text-muted-foreground">جاري تحميل الإشعارات...</p></Card>:null}
   {!loading&&notifications.length===0?<Card><EmptyState icon={<Bell/>} title={t('notifications.inbox.empty')}/></Card>:null}
   {notifications.map(notification=>{
    const isSession=notification.notification_type==='study_session_started'||notification.notification_type==='study_session_created'||notification.notification_type==='study_session_invitation
    const title=payloadText(notification,'title',notification.notification_type==='study_session_started'?'جلسة مذاكرة نشطة':notification.notification_type==='study_session_created'?'جلسة مذاكرة مجدولة':'دعوة لجلسة مذاكرة')
    const message=payloadText(notification,'message','لديك إشعار جديد')
    return <Card key={notification.id} className={cn('p-0',!notification.read_at?'border-primary/25 bg-primary/[0.035]':'')}>
     <button type="button" onClick={()=>void openNotification(notification)} className="flex w-full items-start gap-3 p-3 text-start">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{isSession?<CalendarClock className="size-5"/>:<BellRing className="size-5"/>}</span>
      <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-sm font-semibold">{title}{!notification.read_at?<span className="size-2 rounded-full bg-primary"/>:null}</span><span className="mt-1 block text-xs text-muted-foreground">{message}</span><span className="mt-2 block text-[10px] text-muted-foreground">{new Date(notification.created_at).toLocaleString()}</span></span>
      {isSession?<ExternalLink className="size-4 shrink-0 text-muted-foreground"/>:null}
     </button>
    </Card>
   })}
  </div>:<div className="space-y-3">
   <Card className="space-y-3">
    <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">جلسات المذاكرة</p><p className="text-xs text-muted-foreground">تحكم في إشعارات الجلسات والدعوات.</p></div>{permission==='granted'?<Badge>مفعّلة</Badge>:<Button size="sm" variant="outline" onClick={()=>void requestBrowserPermission()}>{permission==='denied'?'الإعدادات محظورة':'تفعيل إشعارات الجهاز'}</Button>}</div>
    <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"><span><span className="block text-sm font-medium">الجلسات التي تبدأ الآن</span><span className="block text-xs text-muted-foreground">تنبيه عند بدء جلسة في مجتمعك.</span></span><input type="checkbox" checked={preferences?.notify_session_starts??true} onChange={e=>void updatePreference('notify_session_starts',e.target.checked)} className="size-5 accent-primary"/></label>
    <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"><span><span className="block text-sm font-medium">دعوات الجلسات</span><span className="block text-xs text-muted-foreground">تنبيه عند دعوتك لجلسة مذاكرة.</span></span><input type="checkbox" checked={preferences?.notify_session_invites??true} onChange={e=>void updatePreference('notify_session_invites',e.target.checked)} className="size-5 accent-primary"/></label>
    <p className="text-xs text-muted-foreground">إشعارات الجهاز تظهر عندما تسمح بها المتصفح. إشعارات الجلسات محفوظة أيضًا في صندوق الوارد داخل التطبيق.</p>
   </Card>
   <Card padding="none" className="overflow-hidden"><p className="border-b border-border px-4 py-3 text-sm text-muted-foreground">{t('notifications.preferences.note')}</p><ul className="divide-y divide-border">{TYPES.map(key=><li key={key} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2"><span className="text-sm font-medium">{t(key)}</span><Badge>{t('common.planned')}</Badge></li>)}</ul></Card>
  </div>}
 </div>
}
