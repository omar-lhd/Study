'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, History, Info, Plus, Timer, TriangleAlert, Users, DoorOpen, UsersRound, Wifi, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/headers'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useT } from '@/components/providers/preferences-provider'
import type { MessageKey } from '@/i18n/messages/ar'
import { useNow, useSessionFormatters, type SharedSessionSnapshot, listMySharedSessions, listMyStudyCommunities, listVisibleSharedStudySessions } from './use-sessions'
import { SharedSessionCreateDialog } from './shared-session-create-dialog'
import { cn } from '@/lib/utils'

type Group = 'active'|'upcoming'|'completed'
type Row = {
 id:string;title:string;subject:string|null;subject_color:string|null;
 session_type:'private'|'group'|'open_room';status:'scheduled'|'active'|'paused'|'completed'|'canceled';
 access_type:'creator_only'|'invited'|'group';starts_at:string|null;started_at:string|null;ended_at:string|null;
 planned_duration_seconds:number;created_at:string;host_id:string;created_by:string;group_id:string;
}
const TABS: {value:Group;icon:React.ReactNode}[]=[
 {value:'active',icon:<Timer/>},{value:'upcoming',icon:<CalendarClock/>},{value:'completed',icon:<History/>}
]
function clock(value:number){const secs=Math.max(0,Math.floor(value));const h=Math.floor(secs/3600);const m=Math.floor((secs%3600)/60);const s=secs%60;return h?String(h)+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'):String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')}

function SessionCard({row,onOpen,now}:{row:Row;onOpen:(id:string)=>void;now:number}){
 const t=useT();const format=useSessionFormatters()
 const starts=row.starts_at?new Date(row.starts_at):null
 const planned=row.planned_duration_seconds
 const started=row.started_at?new Date(row.started_at).getTime():null
 const end=row.ended_at?new Date(row.ended_at):null
 const seconds=row.status==='active'&&started!==null?Math.max(0,Math.floor((now-started)/1000)):0
 const remaining=Math.max(0,planned-seconds)
 const active=row.status==='active'||row.status==='paused'
 const statusTone=row.status==='active'?'bg-emerald-400/10 text-emerald-300':row.status==='paused'?'bg-amber-400/10 text-amber-300':row.status==='completed'?'bg-white/10 text-muted-foreground':'bg-primary/10 text-primary'
 const typeLabel=row.session_type==='private'?t('sessions.phase2.type.private'):row.session_type==='open_room'?t('sessions.phase2.type.openRoom'):t('sessions.phase2.type.group')
 return <Card className="group relative overflow-hidden border-primary/15 bg-elevated/70 shadow-lg shadow-black/10 backdrop-blur-xl transition hover:border-primary/35">
  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"/>
  <div className="flex items-start justify-between gap-3">
   <div className="min-w-0">
    <div className="mb-2 flex flex-wrap items-center gap-2">
     <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">{typeLabel}</span>
     <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold',statusTone)}>{t(('sessions.status.'+(row.status==='canceled'?'completed':row.status)) as MessageKey)}</span>
    </div>
    <h3 className="truncate text-base font-semibold" dir="auto">{row.title}</h3>
    {row.subject?<p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><i className="size-2 rounded-full" style={{backgroundColor:row.subject_color||'var(--primary)'}}/>{row.subject}</p>:null}
   </div>
   <div className="grid size-10 shrink-0 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary"><UsersRound className="size-5"/></div>
  </div>
  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
   <span className="inline-flex items-center gap-1.5"><Timer className="size-3.5"/>{Math.round(planned/60)} min</span>
   {starts?<span className="inline-flex items-center gap-1.5"><CalendarClock className="size-3.5"/>{format.dateTime(starts.getTime())}</span>:null}
   {active?<span className="font-semibold tabular-nums text-foreground" dir="ltr">{clock(remaining)} {t('sessions.meta.remaining',{time:''})}</span>:null}
  </div>
  <Button className="mt-4 w-full" variant={active?'primary':'outline'} onClick={()=>onOpen(row.id)}>{active?t('sessions.card.enter'):row.status==='completed'?t('sessions.card.summary'):t('sessions.card.details')}</Button>
 </Card>
}

export function SessionsOverview(){
 const t=useT();const router=useRouter()
 const [rows,setRows]=useState<Row[]>([])
 const [tab,setTab]=useState<Group>('active')
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState<string|null>(null)
 const [refresh,setRefresh]=useState(0)
 const [communityCount,setCommunityCount]=useState(0)
 const now=useNow(1000,rows.some(r=>r.status==='active'))
 const groups=useMemo(()=>({
  active:rows.filter(r=>r.status==='active'||r.status==='paused'),
  upcoming:rows.filter(r=>r.status==='scheduled'),
  completed:rows.filter(r=>r.status==='completed'||r.status==='canceled')
 }),[rows])
 useEffect(()=>{
  let alive=true
  setLoading(true);setError(null)
  Promise.all([listMySharedSessions(),listMyStudyCommunities()]).then(([sessions,communities])=>{
   if(!alive)return
   setRows(sessions as Row[]);setCommunityCount(communities.length)
  }).catch(e=>{if(alive)setError(e instanceof Error?e.message:'SESSION_LOAD_FAILED')})
   .finally(()=>{if(alive)setLoading(false)})
  return()=>{alive=false}
 },[refresh])
 useEffect(()=>{
  const timer=window.setInterval(()=>setRefresh(v=>v+1),15000)
  const handle=()=>{if(document.visibilityState==='visible')setRefresh(v=>v+1)}
  window.addEventListener('focus',handle);document.addEventListener('visibilitychange',handle)
  return()=>{window.clearInterval(timer);window.removeEventListener('focus',handle);document.removeEventListener('visibilitychange',handle)}
 },[])
 const grouped=groups[tab]
 const trigger=<Button onClick={()=>{}}><Plus className="size-4"/>{t('sessions.create')}</Button>
 return <div className="space-y-5">
  <PageHeader title={t('study.title')} description={t('study.description')} actions={<SharedSessionCreateDialog trigger={trigger}/>}/>
  <Card variant="panel" className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-card/70 to-cyan-500/5">
   <div className="flex flex-wrap items-center justify-between gap-3">
    <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-primary/15 text-primary"><Users className="size-5"/></span><div><p className="font-semibold">{t('sessions.phase2.live')}</p><p className="text-xs text-muted-foreground">{communityCount} · {t('sessions.phase2.community')}</p></div></div>
    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-300"><Wifi className="size-3.5"/>{t('sessions.phase2.connection.connected')}</span>
   </div>
  </Card>
  {error?<Card className="border-danger/30"><ErrorState icon={<TriangleAlert/>} title={t('sessions.loadError.title')} description={t('sessions.phase2.room.loadError')} action={<Button variant="outline" onClick={()=>setRefresh(v=>v+1)}>{t('common.retry')}</Button>}/></Card>:null}
  <Tabs value={tab} onValueChange={v=>setTab(v as Group)}>
   <TabsList>{TABS.map(({value})=><TabsTrigger value={value} key={value}>{t(('sessions.tab.'+value) as MessageKey)}<span className="ms-1.5 rounded-full bg-secondary px-1.5 text-xs tabular-nums">{groups[value].length}</span></TabsTrigger>)}</TabsList>
   {TABS.map(({value,icon})=><TabsContent value={value} key={value}>
    {loading?<Card><LoadingState label={t('sessions.phase2.room.loading')}/></Card>:grouped.length===0?<Card><EmptyState icon={icon} title={value==='active'?t('sessions.empty.active.title'):value==='upcoming'?t('sessions.empty.upcoming.title'):t('sessions.empty.completed.title')} description={value==='active'?t('sessions.empty.active.description'):value==='upcoming'?t('sessions.empty.upcoming.description'):t('sessions.empty.completed.description')} action={value!=='completed'?<SharedSessionCreateDialog trigger={<Button variant="outline"><Plus className="size-4"/>{t('sessions.create')}</Button>}/>:undefined}/></Card>:<ul className="grid gap-3 md:grid-cols-2">{grouped.map(row=><li key={row.id}><SessionCard row={row} now={now} onOpen={id=>router.push('/study/sessions/'+id)}/></li>)}</ul>}
   </TabsContent>)}
  </Tabs>
 </div>
}
