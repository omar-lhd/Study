'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BookOpen, Check, ChevronDown, ChevronUp, Clock3, Headphones, Lock, LogOut, MessageCircle, MicOff, MoreHorizontal, Pause, Play, Plus, Send, Target, Timer, Users, Volume2, VolumeX, Mic, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/field'
import { useT } from '@/components/providers/preferences-provider'
import type { MessageKey } from '@/i18n/messages/ar'
import { cn } from '@/lib/utils'
import {
 getSharedStudySessionSnapshot,joinSharedStudySession,leaveSharedStudySession,heartbeatSharedStudySession,
 setSharedStudySessionState,requestSharedPause,voteSharedPause,requestSharedSpeakerSeat,respondSharedSpeakerSeat,
 respondSharedSessionInvitation,listMyPendingSharedSessionInvitations,listSharedSessionParticipants,
 listSharedSessionGoals,addSharedSessionGoal,updateSharedSessionGoal,listSharedSessionChat,sendSharedSessionChat,
 listSharedSessionSeatRequests,getSharedSessionSeatAssignments,addSharedSpeakerSeat,releaseSharedSpeakerSeat,listSharedSessionEvents,listSharedSessionPauseRequests,listSharedSessionTimeChangeRequests,proposeSharedSessionTimeChange,voteSharedSessionTimeChange,subscribeSharedSessionRealtime,setMyFocusMode,getCloudCurrentUser,useNow,useSessionFormatters,
 type SharedSessionSnapshot,type LiveSessionParticipant,type LiveSessionGoal,type SessionEvent,type SessionPauseRequest,type SessionTimeChangeRequest
} from './use-sessions'
import { AgoraAudio } from './agora-audio'

type ChatMessage={id:string;sender_id:string;content:string;client_event_id:string;created_at:string}
type SeatRequest={id:string;requester_id:string;target_participant_id:string;status:string;expires_at:string;created_at:string}
type Seat={seat_number:number;participant_id:string;participant:{user_id:string;profiles:{display_name:string;avatar_url:string|null}|null}}
type Invitation={invitation_id:string;session_id:string;title:string;session_type:string;subject:string|null;starts_at:string|null;planned_duration_seconds:number;inviter_id:string;inviter_name:string|null;created_at:string}
const DEVICE_KEY='psc:study-session-device:v1'
function deviceId(){let id=localStorage.getItem(DEVICE_KEY);if(!id){id=crypto.randomUUID();localStorage.setItem(DEVICE_KEY,id)}return id}
function clock(value:number){const s=Math.max(0,Math.floor(value));const h=Math.floor(s/3600);const m=Math.floor((s%3600)/60);const sec=s%60;return h?String(h)+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0'):String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0')}

export function SessionRoom({id}:{id:string}){
 const t=useT();const router=useRouter();const format=useSessionFormatters()
 const [snapshot,setSnapshot]=useState<SharedSessionSnapshot|null>(null)
 const [participants,setParticipants]=useState<LiveSessionParticipant[]>([])
 const [goals,setGoals]=useState<LiveSessionGoal[]>([])
 const [messages,setMessages]=useState<ChatMessage[]>([])
 const [seatRequests,setSeatRequests]=useState<SeatRequest[]>([])
 const [seats,setSeats]=useState<Seat[]>([])
 const [invitations,setInvitations]=useState<Invitation[]>([])
 const [userId,setUserId]=useState<string|null>(null)
 const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null)
 const [connected,setConnected]=useState(true)
 const [chatDraft,setChatDraft]=useState('');const [goalDraft,setGoalDraft]=useState('')
 const [noteDraft,setNoteDraft]=useState('');const [mode,setMode]=useState<'focus'|'collaboration'>('collaboration')
 const [showRoster,setShowRoster]=useState(false)
 const [pauseRequests,setPauseRequests]=useState<SessionPauseRequest[]>([])
 const [timeRequests,setTimeRequests]=useState<SessionTimeChangeRequest[]>([])
 const [events,setEvents]=useState<SessionEvent[]>([])
 const [showPauseConfirm,setShowPauseConfirm]=useState(false)
 const [showPauseVote,setShowPauseVote]=useState(false)
 const [showTimerAdjust,setShowTimerAdjust]=useState(false)
 const [micEnabled,setMicEnabled]=useState(false)
 const [muteAll,setMuteAll]=useState(false)
 const [mutedUserIds,setMutedUserIds]=useState<string[]>([])
 const [volumes,setVolumes]=useState<Record<string,number>>({})
 const [rtcStatus,setRtcStatus]=useState<'connecting'|'connected'|'disconnected'|'error'>('connecting')
 const [rtcError,setRtcError]=useState<string|null>(null)
 const [timeDelta,setTimeDelta]=useState(600)
 const [panel,setPanel]=useState<'goals'|'chat'|'notes'|'board'>('goals')
 const [lastSync,setLastSync]=useState(Date.now()); const now=useNow(1000,snapshot?.status==='active')
 const elapsed=useMemo(()=>snapshot?Math.max(0,snapshot.accumulated_study_seconds+(snapshot.status==='active'&&snapshot.running_since?Math.floor((now-lastSync)/1000):0)):0,[snapshot,now,lastSync])
 const remaining=snapshot?Math.max(0,snapshot.planned_duration_seconds-elapsed):0
 const current=participants.find(p=>p.user_id===userId)
 const seated=useMemo(()=>new Set(seats.map(s=>s.participant.user_id)),[seats])
 const speakers=participants.filter(p=>p.attendance_state==='present'&&seated.has(p.user_id))
 const listeners=participants.filter(p=>p.attendance_state==='present'&&!seated.has(p.user_id))
 const isModerator=current?.participant_role==='host'||current?.participant_role==='moderator'
 const incomingSeatRequests=seatRequests.filter(r=>r.target_participant_id===current?.id)
 const currentUserSeat=seats.find(s=>s.participant.user_id===userId)
 const presentParticipants=participants.filter(p=>p.attendance_state==='present')

 const refresh=useCallback(async()=>{
  const [s,p,g,c,r,ss,inv,u,pauses,times,ev]=await Promise.all([
   getSharedStudySessionSnapshot(id),listSharedSessionParticipants(id),listSharedSessionGoals(id),
   listSharedSessionChat(id),listSharedSessionSeatRequests(id),getSharedSessionSeatAssignments(id),
   listMyPendingSharedSessionInvitations(),getCloudCurrentUser(),listSharedSessionPauseRequests(id),listSharedSessionTimeChangeRequests(id),listSharedSessionEvents(id)
  ])
  setSnapshot(s);setParticipants(p);setGoals(g);setMessages(c);setSeatRequests(r);setSeats(ss);setInvitations(inv);setUserId(u);setPauseRequests(pauses);setTimeRequests(times);setEvents(ev)
  setLastSync(Date.now());setConnected(true);setError(null)
 },[id])
 useEffect(()=>{
  let alive=true;setLoading(true)
  joinSharedStudySession(id).then(()=>refresh()).catch(e=>{if(alive)setError(e instanceof Error?e.message:'SESSION_LOAD_FAILED')}).finally(()=>{if(alive)setLoading(false)})
  return()=>{alive=false}
 },[id,refresh])
 useEffect(()=>{
  if(!current||current.attendance_state!=='present')return
  const heartbeat=window.setInterval(()=>heartbeatSharedStudySession(id).then(()=>setConnected(true)).catch(()=>setConnected(false)),15000)
  const sync=window.setInterval(()=>refresh().catch(()=>setConnected(false)),10000)
  const online=()=>{setConnected(true);refresh().catch(()=>setConnected(false))}
  const offline=()=>setConnected(false)
  window.addEventListener('online',online);window.addEventListener('offline',offline)
  return()=>{clearInterval(heartbeat);clearInterval(sync);window.removeEventListener('online',online);window.removeEventListener('offline',offline)}
 },[id,current?.attendance_state,refresh])
 useEffect(()=>{return()=>{void leaveSharedStudySession(id).catch(()=>{})}},[id])
 const realtimeRefresh=useCallback(()=>{void refresh().catch(()=>setConnected(false))},[refresh])
 useEffect(()=>{if(current?.attendance_state!=='present')return;return subscribeSharedSessionRealtime(id,realtimeRefresh)},[id,current?.attendance_state,realtimeRefresh])
 useEffect(()=>{if(pauseRequests.length>0)setShowPauseVote(true)},[pauseRequests.length])
 useEffect(()=>{if(!currentUserSeat)setMicEnabled(false)},[currentUserSeat?.seat_number])
 const handleRtcStatus=useCallback((status:'connecting'|'connected'|'disconnected'|'error',message?:string)=>{setRtcStatus(status);setRtcError(status==='error'?message??'AGORA_AUDIO_ERROR':null)},[])
 function eventLabel(event:SessionEvent){
  const actor=participants.find(person=>person.user_id===event.actor_id)?.display_name??'عضو'
  switch(event.event_type){
   case 'participant.joined':return actor+' انضم للجلسة'
   case 'participant.left':return actor+' غادر الجلسة'
   case 'speaker.seat_granted':return actor+' صعد لمقعد الصوت'
   case 'speaker.seat_released':return actor+' ترك مقعد الصوت'
   case 'session.pause_requested':return actor+' طلب إيقاف المؤقت'
   case 'session.pause_vote':return actor+' صوّت على إيقاف المؤقت'
   case 'session.pause':return 'تم إيقاف المؤقت'
   case 'session.pause_rejected':return 'تم رفض طلب إيقاف المؤقت'
   case 'session.time_change_requested':return actor+' طلب تعديل وقت الجلسة'
   case 'session.time_change_vote':return actor+' صوّت على تعديل الوقت'
   case 'session.time_changed':return 'تم تعديل وقت الجلسة'
   case 'session.time_change_rejected':return 'تم رفض تعديل الوقت'
   case 'session.focus_changed':return actor+' فعّل وضع التركيز'
   default:return actor+' قام بتحديث الجلسة'
  }
 }

 async function changeState(action:'start'|'pause'|'resume'|'complete'|'cancel'){try{await setSharedStudySessionState(id,action);await refresh()}catch(e){toast.error(e instanceof Error?e.message:'SESSION_ACTION_FAILED')}}
 async function sendChat(){const value=chatDraft.trim();if(!value||!userId)return;try{await sendSharedSessionChat(id,userId,value,crypto.randomUUID());setChatDraft('');await refresh()}catch(e){toast.error(e instanceof Error?e.message:'CHAT_SEND_FAILED')}}
 async function addGoal(){const value=goalDraft.trim();if(!value||!userId)return;try{await addSharedSessionGoal(id,value,userId);setGoalDraft('');await refresh()}catch(e){toast.error(e instanceof Error?e.message:'GOAL_ADD_FAILED')}}
 async function toggleGoal(goal:LiveSessionGoal){try{await updateSharedSessionGoal(goal.id,!goal.completed,userId||'');await refresh()}catch(e){toast.error(e instanceof Error?e.message:'GOAL_UPDATE_FAILED')}}
 async function requestSeat(target:LiveSessionParticipant){try{await requestSharedSpeakerSeat(id,target.user_id);toast.success(t('sessions.phase2.room.seatRequestSent'));setShowRoster(false);await refresh()}catch(e){toast.error(e instanceof Error?e.message:'SEAT_REQUEST_FAILED')}}
 async function claimSeat(){if(!userId)return;try{await addSharedSpeakerSeat(id,userId);await refresh()}catch(e){toast.error(e instanceof Error?e.message:'SPEAKER_SEAT_CLAIM_FAILED')}}
 async function respondSeat(req:SeatRequest,accept:boolean){try{await respondSharedSpeakerSeat(req.id,accept);await refresh()}catch(e){toast.error(e instanceof Error?e.message:'SEAT_TRANSFER_FAILED')}}
 async function respondInvitation(inv:Invitation,join:boolean){try{await respondSharedSessionInvitation(inv.session_id,join);setInvitations(list=>list.filter(item=>item.invitation_id!==inv.invitation_id));if(join)router.push('/study/sessions/'+inv.session_id)}catch(e){toast.error(e instanceof Error?e.message:'INVITATION_FAILED')}}
 async function askPause(){setShowPauseConfirm(true)}
 async function confirmPauseVote(){setShowPauseConfirm(false);try{await requestSharedPause(id);await refresh()}catch(e){toast.error(e instanceof Error?e.message:'PAUSE_REQUEST_FAILED')}}
 async function votePause(request:SessionPauseRequest,vote:'yes'|'no'){try{await voteSharedPause(request.id,vote);await refresh()}catch(e){toast.error(e instanceof Error?e.message:'PAUSE_VOTE_FAILED')}}
 async function proposeTimeChange(delta:number){setShowTimerAdjust(false);try{await proposeSharedSessionTimeChange(id,delta);await refresh()}catch(e){toast.error(e instanceof Error?e.message:'TIME_CHANGE_REQUEST_FAILED')}}
 async function voteTimeChange(request:SessionTimeChangeRequest,vote:'yes'|'no'){try{await voteSharedSessionTimeChange(request.id,vote);await refresh()}catch(e){toast.error(e instanceof Error?e.message:'TIME_CHANGE_VOTE_FAILED')}}
 async function toggleFocusMode(){const next=mode==='focus'?'collaboration':'focus';setMode(next);setMuteAll(next==='focus');try{await setMyFocusMode(id,next==='focus');await refresh()}catch(e){toast.error(e instanceof Error?e.message:'FOCUS_MODE_FAILED')}}
 async function onLeave(){try{await leaveSharedStudySession(id);router.push('/study')}catch(e){toast.error(e instanceof Error?e.message:'SESSION_LEAVE_FAILED')}}
 const unreadRequests=incomingSeatRequests.filter(req=>req.status==='pending')
 if(loading)return <div className="mx-auto max-w-5xl p-4"><Card className="p-8 text-center text-sm text-muted-foreground">{t('sessions.phase2.room.loading')}</Card></div>
 if(error||!snapshot)return <div className="mx-auto max-w-4xl space-y-4 p-4"><Link href="/study" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="size-4 rtl:rotate-180"/>{t('sessions.room.back')}</Link><Card className="border-danger/30 p-5"><p className="font-semibold">{t('sessions.loadError.title')}</p><p className="mt-2 text-sm text-muted-foreground">{t('sessions.phase2.room.loadError')}</p><Button className="mt-4" variant="outline" onClick={()=>refresh().then(()=>setError(null)).catch(e=>setError(String(e)))}>{t('common.retry')}</Button></Card></div>
 const completedGoals=goals.filter(g=>g.completed).length
 const goalPercent=goals.length?Math.round(completedGoals/goals.length*100):0
 const isFocus=mode==='focus'
 return <>
  <AgoraAudio sessionId={id} userId={userId} participants={presentParticipants} canPublish={Boolean(currentUserSeat)&&snapshot.allow_audio&&snapshot.status==='active'} micEnabled={micEnabled} mutedAll={muteAll} mutedUserIds={mutedUserIds} volumes={volumes} onStatus={handleRtcStatus}/>
  <main className="mx-auto flex h-[calc(100dvh-10rem)] min-h-0 w-full max-w-6xl flex-col gap-2 overflow-hidden pb-2 sm:gap-3">
  <div className="flex items-center justify-between gap-3">
   <Link href="/study" className="grid size-11 place-items-center rounded-2xl border border-white/10 bg-[#11132e]/75 text-slate-200 shadow-lg backdrop-blur-xl"><ArrowLeft className="size-5 rtl:rotate-180"/></Link>
   <div className="flex min-w-0 flex-1 items-center gap-3">
    <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-violet-400/40 bg-gradient-to-br from-violet-600/30 to-blue-500/15 text-violet-300 shadow-[0_0_26px_rgba(109,66,255,.25)]"><Users className="size-6"/></div>
    <div className="min-w-0"><h1 className="truncate text-base font-semibold">{snapshot.title}</h1><button type="button" onClick={()=>setShowRoster(true)} className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={cn('size-2 rounded-full',connected?'bg-emerald-400':'bg-rose-500')}/>{snapshot.status==='active'?'Live':snapshot.status==='paused'?'Paused':snapshot.status} · {snapshot.participant_count} {t('sessions.phase2.room.present')}</button></div>
   </div>
   <button className="grid size-11 place-items-center rounded-2xl border border-white/10 bg-[#11132e]/75 text-slate-300" aria-label="More"><MoreHorizontal/></button>
  </div>
  <Card className="shrink-0 overflow-hidden border-violet-400/20 bg-gradient-to-r from-[#17143d]/95 via-[#111638]/90 to-[#25145a]/80 p-2 shadow-[0_14px_50px_rgba(26,12,92,.32)] backdrop-blur-2xl">
   <div className="flex items-center gap-3"><Target className="size-7 shrink-0 text-violet-300"/><div className="min-w-0 flex-1"><div className="flex justify-between gap-2 text-sm font-semibold"><span>{t('sessions.phase2.room.goals')}</span><span>{goalPercent}%</span></div><p className="mt-0.5 truncate text-xs text-slate-300">{goals.find(g=>!g.completed)?.text||snapshot.subject||snapshot.title}</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-black/25"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-blue-500 to-cyan-400" style={{width:goalPercent+'%'}}/></div></div></div>
  </Card>
  <section className="relative flex min-h-0 flex-1 cursor-pointer items-center justify-center overflow-hidden rounded-[2rem] border border-violet-400/10 bg-[radial-gradient(ellipse_at_50%_50%,rgba(47,30,128,.42),transparent_58%),linear-gradient(120deg,#06091e,#090b27_55%,#0c0624)] py-2 shadow-[inset_0_0_70px_rgba(41,34,133,.2)]" role="button" tabIndex={0} aria-label="Adjust session timer" onClick={()=>setShowTimerAdjust(true)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setShowTimerAdjust(true)}}}>
   <div className="pointer-events-none absolute -inset-x-10 top-1/3 h-32 rotate-[-8deg] rounded-[50%] border-y border-cyan-400/20 bg-gradient-to-r from-transparent via-blue-500/10 to-violet-500/10 blur-xl"/>
   <div className="relative grid size-[min(56vw,13.5rem)] place-items-center rounded-full bg-[conic-gradient(from_20deg,#10d9ff,#416dff,#8b40ff,#2c31d7,#10d9ff)] p-[5px] shadow-[0_0_55px_rgba(75,71,255,.3)] sm:size-56">
    <div className="flex size-full flex-col items-center justify-center rounded-full border border-white/10 bg-[radial-gradient(circle_at_50%_35%,#141d51,#070a22_72%)] text-white">
     <div className="mb-2 grid size-10 place-items-center rounded-full bg-blue-500/15 text-cyan-300">{snapshot.status==='active'?<Pause className="size-5"/>:<Play className="size-5"/>}</div>
     <div className="text-[2.7rem] font-bold tracking-tight tabular-nums sm:text-5xl" dir="ltr">{clock(remaining)}</div>
     <div className="mt-2 rounded-full bg-white/5 px-3 py-1 text-[11px] text-slate-300">{t('sessions.room.elapsed')} · {clock(elapsed)}</div>
    </div>
   </div>
  </section>
  <section className="grid shrink-0 grid-cols-3 gap-x-2 gap-y-1 px-1" aria-label="Six microphone seats">
   {Array.from({length:6},(_,index)=>{
    const seat=seats.find(item=>item.seat_number===index+1)
    const person=seat?presentParticipants.find(item=>item.user_id===seat.participant.user_id):null
    return <button key={index} type="button" onClick={()=>{if(person){if(person.user_id===userId)setMicEnabled(v=>!v);else void requestSeat(person)}else void claimSeat()}} className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-[#10122d]/70 py-1.5 text-center" aria-label={person?person.display_name:'Claim empty microphone seat'}>
     <span className={cn('relative grid size-10 place-items-center rounded-full border-2 p-0.5',person?'border-cyan-400 bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-600':'border-violet-400/40 bg-violet-500/10')}>
      {person?.avatar_url?<img src={person.avatar_url} alt="" className="size-full rounded-full object-cover"/>:<span className="grid size-full place-items-center rounded-full bg-[#101334] text-violet-200">{person?person.display_name.slice(0,1):<Plus className="size-4"/>}</span>}
      {person?<span className="absolute -bottom-0.5 -end-0.5 size-2.5 rounded-full border border-[#090b25] bg-emerald-400"/>:null}
     </span>
     <span className="max-w-full truncate text-[10px] font-medium">{person?.display_name||'+'}</span>
    </button>
   })}
  </section>
  <Card className="shrink-0 border-violet-400/20 bg-[#0e1030]/80 p-2 shadow-[0_12px_38px_rgba(21,12,84,.25)] backdrop-blur-xl">
   <div className="flex items-center justify-between gap-2">
    <button type="button" onClick={()=>setShowRoster(true)} className="flex min-w-0 items-center gap-2 text-xs font-medium"><Users className="size-4 text-violet-300"/>{t('sessions.phase2.room.listeners')} · {listeners.length}<span className="text-muted-foreground">({snapshot.participant_count})</span></button>
    <button type="button" onClick={()=>setShowRoster(true)} className="shrink-0 rounded-full border border-violet-400/30 px-3 py-1 text-xs text-violet-200" disabled={!speakers.length}>{t('sessions.phase2.room.requestSeat')}</button>
   </div>
  </Card>
  <div className="grid shrink-0 grid-cols-4 gap-1.5">
   {(['goals','chat','notes','board'] as const).map(p=><button key={p} onClick={()=>setPanel(p)} className={cn('flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border px-1 text-xs font-medium',panel===p?'border-violet-400/40 bg-violet-500/15 text-violet-200':'border-white/10 bg-[#10122d]/80 text-slate-300')}><span className="text-violet-300">{p==='goals'?<Target/>:p==='chat'?<MessageCircle/>:p==='notes'?<BookOpen/>:<Lock/>}</span>{t(('sessions.phase2.room.'+p) as MessageKey)}</button>)}
  </div>
  {panel==='goals'?<Card className="border-violet-400/15 bg-[#0d102b]/90 p-4"><div className="mb-3 flex items-center gap-2 font-semibold"><Target className="size-4 text-violet-300"/>{t('sessions.phase2.room.goals')}</div><div className="space-y-2">{goals.map(g=><button key={g.id} onClick={()=>toggleGoal(g)} className="flex w-full items-center gap-2 rounded-xl bg-white/5 p-3 text-start text-sm"><span className={cn('grid size-5 place-items-center rounded-md border',g.completed?'border-cyan-400 bg-cyan-500/20 text-cyan-300':'border-white/20')}>{g.completed?<Check className="size-3.5"/>:null}</span><span className={cn(g.completed?'text-slate-500 line-through':'')}>{g.text}</span></button>)}</div><form className="mt-3 flex gap-2" onSubmit={e=>{e.preventDefault();void addGoal()}}><input value={goalDraft} onChange={e=>setGoalDraft(e.target.value)} placeholder={t('sessions.phase2.room.goalPlaceholder')} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm"/><Button disabled={!goalDraft.trim()}><Send className="size-4"/></Button></form></Card>:null}
  {panel==='chat'?<Card className="border-violet-400/15 bg-[#0d102b]/90 p-4"><div className="mb-3 flex items-center gap-2 font-semibold"><MessageCircle className="size-4 text-violet-300"/>{t('sessions.phase2.room.chat')}</div><div className="max-h-72 space-y-2 overflow-y-auto">{messages.map(m=><div key={m.id} className={cn('max-w-[85%] rounded-2xl p-3 text-sm',m.sender_id===userId?'ms-auto bg-violet-600/30':'bg-white/5')}><p>{m.content}</p><p className="mt-1 text-[10px] opacity-60">{format.time(new Date(m.created_at).getTime())}</p></div>)}</div><form className="mt-3 flex gap-2" onSubmit={e=>{e.preventDefault();void sendChat()}}><input value={chatDraft} onChange={e=>setChatDraft(e.target.value)} placeholder={t('sessions.phase2.room.chatPlaceholder')} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm"/><Button disabled={!chatDraft.trim()}><Send className="size-4"/></Button></form></Card>:null}
  {panel==='notes'?<Card className="border-violet-400/15 bg-[#0d102b]/90 p-4"><div className="mb-3 flex items-center gap-2 font-semibold"><BookOpen className="size-4 text-violet-300"/>{t('sessions.phase2.room.notes')}</div><Textarea value={noteDraft} onChange={e=>setNoteDraft(e.target.value)} placeholder={t('sessions.phase2.room.notePlaceholder')} className="min-h-28"/><Button className="mt-2" onClick={async()=>{if(!userId||!noteDraft.trim())return;try{const {addSharedSessionNote}=await import('./use-sessions');await addSharedSessionNote(id,userId,noteDraft.trim());setNoteDraft('');await refresh()}catch(e){toast.error(e instanceof Error?e.message:'NOTE_SAVE_FAILED')}}}>{t('sessions.phase2.room.send')}</Button></Card>:null}
  {panel==='board'?<Card className="border-violet-400/15 bg-[#0d102b]/90 p-4"><div className="font-semibold">{t('sessions.phase2.room.board')}</div><p className="mt-2 text-sm text-muted-foreground">{t('sessions.phase2.room.boardUnavailable')}</p></Card>:null}
  {unreadRequests.map(req=><Card key={req.id} className="border-cyan-400/30 bg-violet-500/10 p-3"><p className="text-sm font-semibold">{t('sessions.phase2.room.seatRequestPending')}</p><div className="mt-2 flex gap-2"><Button onClick={()=>respondSeat(req,true)}>{t('sessions.phase2.room.accept')}</Button><Button variant="outline" onClick={()=>respondSeat(req,false)}>{t('sessions.phase2.room.reject')}</Button></div></Card>)}
  <div className="grid shrink-0 grid-cols-3 gap-1.5 rounded-2xl border border-violet-400/15 bg-[#10122e]/85 p-2 sm:grid-cols-4">
   {isModerator&&snapshot.status==='scheduled'?<Button onClick={()=>void changeState('start')}><Play className="me-2 size-4"/>{t('sessions.phase2.room.start')}</Button>:isModerator&&snapshot.status==='active'?<Button onClick={()=>setShowPauseConfirm(true)}><Pause className="me-2 size-4"/>{t('sessions.phase2.room.pause')}</Button>:isModerator&&snapshot.status==='paused'?<Button onClick={()=>void changeState('resume')}><Play className="me-2 size-4"/>{t('sessions.phase2.room.resume')}</Button>:<Button variant="outline" onClick={()=>void askPause()}>{t('sessions.phase2.room.pauseRequest')}</Button>}
   <Button variant="outline" onClick={()=>void toggleFocusMode()}>{isFocus?t('sessions.phase2.room.collaboration'):t('sessions.phase2.room.focus')}</Button>
   {currentUserSeat?<Button onClick={()=>setMicEnabled(v=>!v)}><Mic className="me-2 size-4"/>{micEnabled?'كتم الميكروفون':'فتح الميكروفون'}</Button>:<Button variant="outline" onClick={()=>setShowRoster(true)}><Headphones className="me-2 size-4"/>{t('sessions.phase2.room.requestSeat')}</Button>}
   {currentUserSeat?<Button variant="outline" onClick={()=>void releaseSharedSpeakerSeat(id).then(()=>{setMicEnabled(false);return refresh()}).catch(e=>toast.error(e instanceof Error?e.message:'SEAT_RELEASE_FAILED'))}><MicOff className="me-2 size-4"/>{t('sessions.phase2.room.releaseSeat')}</Button>:null}
   <Button variant="outline" onClick={()=>setMuteAll(v=>!v)}>{muteAll?<VolumeX className="me-2 size-4"/>:<Volume2 className="me-2 size-4"/>}{muteAll?'إلغاء كتم الكل':'كتم صوت الكل'}</Button>
   <Button variant="danger" onClick={()=>void onLeave()}><LogOut className="me-2 size-4"/>{t('sessions.phase2.room.leave')}</Button>
  </div>
  {mode==='focus'?<div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">{t('sessions.focus.banner')}</div>:null}
  {showRoster?<div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center"><Card className="max-h-[80dvh] w-full max-w-md overflow-y-auto border-violet-400/30 bg-[#111333] p-4"><div className="mb-3 flex items-center justify-between"><strong className="text-base">{t('sessions.phase2.room.present')} · {snapshot.participant_count}</strong><button type="button" onClick={()=>setShowRoster(false)} className="grid size-9 place-items-center rounded-full bg-white/5" aria-label="Close participant list"><X className="size-4"/></button></div><div className="space-y-1">{presentParticipants.map(person=>{const speaker=seated.has(person.user_id);return <button key={person.id} type="button" onClick={()=>speaker&&person.user_id!==userId?void requestSeat(person):undefined} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-start hover:bg-white/5"><span className={cn('size-2.5 shrink-0 rounded-full',speaker?'bg-emerald-400':'bg-amber-400')}/>{person.avatar_url?<img src={person.avatar_url} alt="" className="size-9 rounded-full object-cover"/>:<span className="grid size-9 place-items-center rounded-full bg-violet-500/20">{person.display_name.slice(0,1)}</span>}<span className="min-w-0 flex-1 truncate text-sm">{person.display_name}</span>{speaker&&person.user_id!==userId?<Headphones className="size-4 text-violet-300"/>:null}</button>})}</div></Card></div>:null}
  {invitations.filter(i=>i.session_id!==id).map(inv=><div key={inv.invitation_id} className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"><Card className="w-full max-w-sm border-violet-400/30 bg-[#111333] p-5"><div className="mb-3 flex items-center gap-2 text-violet-300"><Users className="size-5"/><strong>{t('sessions.phase2.invitation.title')}</strong></div><p className="text-sm">{inv.title}</p><div className="mt-4 flex flex-col gap-2"><Button onClick={()=>respondInvitation(inv,true)}>{t('sessions.phase2.invitation.join')}</Button><Button variant="outline" onClick={()=>respondInvitation(inv,false)}><X className="me-2 size-4"/>{t('sessions.phase2.invitation.keepSolo')}</Button></div></Card></div>)}
 </main>
 </>
}
