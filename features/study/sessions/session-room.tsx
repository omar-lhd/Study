'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BookOpen, Check,  Headphones, Grid3X3, LogOut, MessageCircle, MicOff, MoreHorizontal, Pause, Play, Plus, Send, Target, Timer, Users, Volume2, VolumeX, Mic, X } from 'lucide-react'
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
 listSharedSessionSeatRequests,getSharedSessionSeatAssignments,addSharedSpeakerSeat,releaseSharedSpeakerSeat,listSharedSessionEvents,listSharedSessionPauseRequests,listSharedSessionTimeChangeRequests,proposeSharedSessionTimeChange,voteSharedSessionTimeChange,subscribeSharedSessionRealtime,setMyFocusMode,cleanupSharedSessionPresence,expireSharedSessionVotes,getCloudCurrentUser,useNow,useSessionFormatters,
 type SharedSessionSnapshot,type LiveSessionParticipant,type LiveSessionGoal,type SessionEvent,type SessionPauseRequest,type SessionTimeChangeRequest
} from './use-sessions'
import { AgoraAudio } from './agora-audio'
import { SessionWhiteboard } from './session-whiteboard'

type ChatMessage={id:string;sender_id:string;content:string;client_event_id:string;created_at:string}
type SeatRequest={id:string;requester_id:string;target_participant_id:string;status:string;expires_at:string;created_at:string}
type Seat={seat_number:number;participant_id:string;participant:{user_id:string;profiles:{display_name:string;avatar_url:string|null}|null}}
type Invitation={invitation_id:string;session_id:string;title:string;session_type:string;subject:string|null;starts_at:string|null;planned_duration_seconds:number;inviter_id:string;inviter_name:string|null;created_at:string}
const DEVICE_KEY='psc:study-session-device:v1'
function deviceId(){let id=localStorage.getItem(DEVICE_KEY);if(!id){id=crypto.randomUUID();localStorage.setItem(DEVICE_KEY,id)}return id}
function clock(value:number){const s=Math.max(0,Math.floor(value));const h=Math.floor(s/3600);const m=Math.floor((s%3600)/60);const sec=s%60;return h?String(h)+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0'):String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0')}

export function SessionRoom({id}:{id:string}){
 const t=useT();const router=useRouter();const format=useSessionFormatters()
 const leaveStartedRef=useRef(false)
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
 const [panelOpen,setPanelOpen]=useState(false)
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
 const now=useNow(1000,snapshot?.status==='active'||pauseRequests.length>0||timeRequests.length>0)
 const elapsed=useMemo(()=>snapshot?Math.max(0,snapshot.accumulated_study_seconds+(snapshot.status==='active'&&snapshot.server_now?Math.floor((now-new Date(snapshot.server_now).getTime())/1000):0)):0,[snapshot,now])
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
  await cleanupSharedSessionPresence(id).catch(()=>0)
  await expireSharedSessionVotes(id).catch(()=>0)
  const [s,p,g,c,r,ss,inv,u,pauses,times,ev]=await Promise.all([
   getSharedStudySessionSnapshot(id),listSharedSessionParticipants(id),listSharedSessionGoals(id),
   listSharedSessionChat(id),listSharedSessionSeatRequests(id),getSharedSessionSeatAssignments(id),
   listMyPendingSharedSessionInvitations(),getCloudCurrentUser(),listSharedSessionPauseRequests(id),listSharedSessionTimeChangeRequests(id),listSharedSessionEvents(id)
  ])
  setSnapshot(s);setParticipants(p);setGoals(g);setMessages(c);setSeatRequests(r);setSeats(ss);setInvitations(inv);setUserId(u);setPauseRequests(pauses);setTimeRequests(times);setEvents(ev)
  setConnected(true);setError(null)
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
  const online=()=>{setConnected(true);joinSharedStudySession(id).then(()=>refresh()).catch(()=>setConnected(false))}
  const offline=()=>setConnected(false)
  window.addEventListener('online',online);window.addEventListener('offline',offline)
  return()=>{clearInterval(heartbeat);clearInterval(sync);window.removeEventListener('online',online);window.removeEventListener('offline',offline)}
 },[id,current?.attendance_state,refresh])
 useEffect(()=>{leaveStartedRef.current=false;return()=>{if(!leaveStartedRef.current){leaveStartedRef.current=true;void leaveSharedStudySession(id).catch(()=>{})}}},[id])
 const realtimeRefresh=useCallback(()=>{void refresh().catch(()=>setConnected(false))},[refresh])
 useEffect(()=>{if(current?.attendance_state!=='present')return;return subscribeSharedSessionRealtime(id,realtimeRefresh)},[id,current?.attendance_state,realtimeRefresh])
 useEffect(()=>{if(pauseRequests.length>0)setShowPauseVote(true);else setShowPauseVote(false)},[pauseRequests.length])
 useEffect(()=>{if(timeRequests.length>0)setShowTimerAdjust(true)},[timeRequests.length])
 useEffect(()=>{if(current){setMode(current.focus_mode?'focus':'collaboration');setMuteAll(current.focus_mode)}},[current?.focus_mode])
 useEffect(()=>{if(!currentUserSeat)setMicEnabled(false)},[currentUserSeat?.seat_number])
 const handleRtcStatus=useCallback((status:'connecting'|'connected'|'disconnected'|'error',message?:string)=>{setRtcStatus(status);setRtcError(status==='error'?message??'AGORA_AUDIO_ERROR':null);if(status==='error')setMicEnabled(false)},[])
 function eventLabel(event:SessionEvent){
  const targetId=typeof event.payload.participant_id==='string'?event.payload.participant_id:typeof event.payload.user_id==='string'?event.payload.user_id:typeof event.payload.target_participant_id==='string'?event.payload.target_participant_id:null
  const target=targetId?participants.find(person=>person.id===targetId||person.user_id===targetId):undefined
  const actor=participants.find(person=>person.user_id===event.actor_id)?.display_name??target?.display_name??'عضو'
  const targetName=target?.display_name??'عضو'
  switch(event.event_type){
   case 'participant.joined':return actor+' انضم للجلسة'
   case 'participant.left':return targetName+' غادر الجلسة'
   case 'speaker.seat_granted':return targetName+' صعد لمقعد الصوت'
   case 'speaker.seat_requested':return actor+' طلب التحدث من '+targetName
   case 'speaker.seat_request_accepted':return targetName+' وافق على طلب الصوت'
   case 'speaker.seat_request_rejected':return targetName+' رفض طلب الصوت'
   case 'speaker.seat_request_expired':return 'انتهت صلاحية طلب الصوت'
   case 'speaker.seat_released':return targetName+' ترك مقعد الصوت'
   case 'session.pause_requested':return actor+' طلب إيقاف المؤقت'
   case 'session.pause_vote':return actor+' صوّت على إيقاف المؤقت'
   case 'session.pause':return 'تم إيقاف المؤقت'
   case 'session.pause_rejected':return 'تم رفض طلب إيقاف المؤقت'
   case 'session.time_change_requested':return actor+' طلب تعديل وقت الجلسة'
   case 'session.time_change_vote':return actor+' صوّت على تعديل الوقت'
   case 'session.time_changed':return 'تم تعديل وقت الجلسة'
   case 'session.time_change_rejected':return 'تم رفض تعديل الوقت'
   case 'session.focus_changed':return actor+(event.payload.focus_mode===true?' فعّل وضع التركيز':' أوقف وضع التركيز')
   case 'participant.whiteboard_opened':return targetName+' داخل السبورة'
   case 'participant.whiteboard_closed':return targetName+' خرج من السبورة'
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
  <AgoraAudio sessionId={id} userId={userId} participants={presentParticipants} audioAvailable={snapshot.allow_audio&&(snapshot.status==='active'||snapshot.status==='paused')} canPublish={Boolean(currentUserSeat)&&snapshot.allow_audio&&snapshot.status==='active'} micEnabled={micEnabled} mutedAll={muteAll} mutedUserIds={mutedUserIds} volumes={volumes} onStatus={handleRtcStatus}/>
  <main className="study-session-room mx-auto flex h-[100dvh] min-h-0 w-full max-w-none flex-col gap-2 overflow-y-auto px-3 pt-3 pb-2 sm:gap-3">
  <div className="flex items-center justify-between gap-3">
   <Link href="/study" className="grid size-11 place-items-center rounded-2xl border border-white/10 bg-[#11132e]/75 text-slate-200 shadow-lg backdrop-blur-xl"><ArrowLeft className="size-5 rtl:rotate-180"/></Link>
   <div className="flex min-w-0 flex-1 items-center gap-3">
    <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-violet-400/40 bg-gradient-to-br from-violet-600/30 to-blue-500/15 text-violet-300 shadow-[0_0_26px_rgba(109,66,255,.25)]"><Users className="size-6"/></div>
    <div className="min-w-0"><h1 className="truncate text-base font-semibold">{snapshot.title}</h1><button type="button" onClick={()=>setShowRoster(true)} className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={cn('size-2 rounded-full',connected?'bg-emerald-400':'bg-rose-500')}/>{snapshot.status==='active'?'Live':snapshot.status==='paused'?'Paused':snapshot.status} · {snapshot.participant_count} {t('sessions.phase2.room.present')} · <span className={cn('text-[10px]',rtcStatus==='connected'?'text-emerald-300':rtcStatus==='error'?'text-rose-300':'text-slate-400')}>{rtcStatus==='connected'?'صوت متصل':rtcStatus==='connecting'?'جاري الاتصال':rtcStatus==='error'?'خطأ الصوت':'الصوت غير متصل'}</span></button></div>
   </div>
   <button type="button" onClick={()=>setShowRoster(true)} className="grid size-11 place-items-center rounded-2xl border border-white/10 bg-[#11132e]/75 text-slate-300" aria-label="Participants and session options"><MoreHorizontal/></button>
  </div>
  <Card className="shrink-0 overflow-hidden border-violet-400/20 bg-gradient-to-r from-[#17143d]/95 via-[#111638]/90 to-[#25145a]/80 p-2 shadow-[0_14px_50px_rgba(26,12,92,.32)] backdrop-blur-2xl">
   <div className="flex items-center gap-3"><Target className="size-7 shrink-0 text-violet-300"/><div className="min-w-0 flex-1"><div className="flex justify-between gap-2 text-sm font-semibold"><span>{t('sessions.phase2.room.goals')}</span><span>{goalPercent}%</span></div><p className="mt-0.5 truncate text-xs text-slate-300">{goals.find(g=>!g.completed)?.text||snapshot.subject||snapshot.title}</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-black/25"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-blue-500 to-cyan-400" style={{width:goalPercent+'%'}}/></div></div></div>
  </Card>
  <section className="relative flex min-h-0 flex-1 cursor-pointer items-center justify-center overflow-hidden rounded-[2rem] border border-violet-400/10 bg-[radial-gradient(ellipse_at_50%_50%,rgba(47,30,128,.42),transparent_58%),linear-gradient(120deg,#06091e,#090b27_55%,#0c0624)] py-2 shadow-[inset_0_0_70px_rgba(41,34,133,.2)]" role="button" tabIndex={0} aria-label="Adjust session timer" onClick={()=>setShowTimerAdjust(true)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setShowTimerAdjust(true)}}}>
   <div className="pointer-events-none absolute -inset-x-10 top-1/3 h-32 rotate-[-8deg] rounded-[50%] border-y border-cyan-400/20 bg-gradient-to-r from-transparent via-blue-500/10 to-violet-500/10 blur-xl"/>
   <div className="relative grid size-[min(42vw,9rem)] place-items-center rounded-full bg-[conic-gradient(from_20deg,#10d9ff,#416dff,#8b40ff,#2c31d7,#10d9ff)] p-[5px] shadow-[0_0_55px_rgba(75,71,255,.3)] sm:size-56">
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
     <span className={cn('relative grid size-[5.5rem] place-items-center rounded-full border-2 p-1 shadow-[0_0_24px_rgba(65,110,255,.22)] sm:size-24',person?'border-cyan-400 bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-600':'border-violet-400/40 bg-violet-500/10')}>
      {person?.avatar_url?<img src={person.avatar_url} alt="" className="size-full rounded-full object-cover"/>:<span className="grid size-full place-items-center rounded-full bg-[#101334] text-violet-200">{person?person.display_name.slice(0,1):<Plus className="size-4"/>}</span>}
      {person?<span className="absolute -bottom-0.5 -end-0.5 size-2.5 rounded-full border border-[#090b25] bg-emerald-400"/>:null}{person?.focus_mode?<Target className="absolute -top-1 -end-1 size-3 rounded-full bg-[#090b25] text-cyan-300"/>:null}
     </span>
     <span className="max-w-full truncate text-xs font-medium">{person?.display_name||'+'}</span>
    </button>
   })}
  </section>
  <Card className="shrink-0 border-violet-400/20 bg-[#0e1030]/80 p-2 shadow-[0_12px_38px_rgba(21,12,84,.25)] backdrop-blur-xl">
   <div className="flex items-center justify-between gap-2">
    <button type="button" onClick={()=>setShowRoster(true)} className="flex min-w-0 items-center gap-2 text-xs font-medium"><Users className="size-4 text-violet-300"/>{t('sessions.phase2.room.listeners')} · {listeners.length}<span className="text-muted-foreground">({snapshot.participant_count})</span></button>
    <button type="button" onClick={()=>setShowRoster(true)} className="shrink-0 rounded-full border border-violet-400/30 px-3 py-1 text-xs text-violet-200" disabled={listeners.length===0}>{t('sessions.phase2.room.requestSeat')}</button>
   </div>
  </Card>
  <div className="grid shrink-0 grid-cols-4 gap-1.5">
   {(['goals','chat','notes','board'] as const).map(p=><button key={p} onClick={()=>{setPanel(p);setPanelOpen(true)}} className={cn('flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border px-1 text-[10px] font-medium',panel===p?'border-violet-400/40 bg-violet-500/15 text-violet-200':'border-white/10 bg-[#10122d]/80 text-slate-300')}><span className="text-violet-300">{p==='goals'?<Target/>:p==='chat'?<MessageCircle/>:p==='notes'?<BookOpen/>:<Grid3X3/>}</span>{t(('sessions.phase2.room.'+p) as MessageKey)}</button>)}
  </div>
  {panelOpen&&panel!=='board'?<div className="fixed inset-x-3 bottom-24 top-24 z-[65] flex flex-col gap-2 overflow-hidden"><div className="flex shrink-0 justify-end"><button type="button" onClick={()=>setPanelOpen(false)} className="grid size-9 place-items-center rounded-full border border-white/10 bg-[#111333]" aria-label="Close session panel"><X className="size-4"/></button></div><div className="min-h-0 flex-1 overflow-hidden">
  {panel==='goals'?<Card className="h-full min-h-0 overflow-y-auto border-violet-400/15 bg-[#0d102b]/90 p-3"><div className="mb-3 flex items-center gap-2 font-semibold"><Target className="size-4 text-violet-300"/>{t('sessions.phase2.room.goals')}</div><div className="max-h-[calc(100%-5rem)] space-y-2 overflow-y-auto">{goals.map(g=><button key={g.id} onClick={()=>toggleGoal(g)} className="flex w-full items-center gap-2 rounded-xl bg-white/5 p-3 text-start text-sm"><span className={cn('grid size-5 place-items-center rounded-md border',g.completed?'border-cyan-400 bg-cyan-500/20 text-cyan-300':'border-white/20')}>{g.completed?<Check className="size-3.5"/>:null}</span><span className={cn(g.completed?'text-slate-500 line-through':'')}>{g.text}</span></button>)}</div><form className="mt-3 flex gap-2" onSubmit={e=>{e.preventDefault();void addGoal()}}><input value={goalDraft} onChange={e=>setGoalDraft(e.target.value)} placeholder={t('sessions.phase2.room.goalPlaceholder')} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm"/><Button disabled={!goalDraft.trim()}><Send className="size-4"/></Button></form></Card>:null}
  {panel==='chat'?<Card className="h-full min-h-0 flex flex-col overflow-hidden border-violet-400/15 bg-[#0d102b]/90 p-3"><div className="mb-3 flex items-center gap-2 font-semibold"><MessageCircle className="size-4 text-violet-300"/>{t('sessions.phase2.room.chat')}</div><div className="min-h-0 flex-1 space-y-2 overflow-y-auto"><div className="space-y-1">{events.slice(0,12).reverse().map(event=><div key={event.id} className="rounded-xl border border-white/5 bg-white/[0.035] px-3 py-2 text-[11px] text-slate-300">{eventLabel(event)}<span className="ms-2 text-[9px] opacity-50">{format.time(new Date(event.occurred_at).getTime())}</span></div>)}</div>{messages.map(m=><div key={m.id} className={cn('max-w-[85%] rounded-2xl p-3 text-sm',m.sender_id===userId?'ms-auto bg-violet-600/30':'bg-white/5')}><p>{m.content}</p><p className="mt-1 text-[10px] opacity-60">{format.time(new Date(m.created_at).getTime())}</p></div>)}</div><form className="mt-3 flex gap-2" onSubmit={e=>{e.preventDefault();void sendChat()}}><input value={chatDraft} onChange={e=>setChatDraft(e.target.value)} placeholder={t('sessions.phase2.room.chatPlaceholder')} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm"/><Button disabled={!chatDraft.trim()}><Send className="size-4"/></Button></form></Card>:null}
  {panel==='notes'?<Card className="h-full min-h-0 overflow-y-auto border-violet-400/15 bg-[#0d102b]/90 p-3"><div className="mb-3 flex items-center gap-2 font-semibold"><BookOpen className="size-4 text-violet-300"/>{t('sessions.phase2.room.notes')}</div><Textarea value={noteDraft} onChange={e=>setNoteDraft(e.target.value)} placeholder={t('sessions.phase2.room.notePlaceholder')} className="min-h-28"/><Button className="mt-2" onClick={async()=>{if(!userId||!noteDraft.trim())return;try{const {addSharedSessionNote}=await import('./use-sessions');await addSharedSessionNote(id,userId,noteDraft.trim());setNoteDraft('');await refresh()}catch(e){toast.error(e instanceof Error?e.message:'NOTE_SAVE_FAILED')}}}>{t('sessions.phase2.room.send')}</Button></Card>:null}
  </div>
  </div>:null}
  {panelOpen&&panel==='board'?<SessionWhiteboard sessionId={id} userId={userId} onClose={()=>setPanelOpen(false)}/>:null}
  {unreadRequests.map(req=><Card key={req.id} className="fixed bottom-24 end-3 z-50 max-h-28 w-[min(90vw,24rem)] overflow-y-auto border-cyan-400/30 bg-[#111333] p-3"><p className="text-sm font-semibold">{t('sessions.phase2.room.seatRequestPending')}</p><div className="mt-2 flex gap-2"><Button onClick={()=>respondSeat(req,true)}>{t('sessions.phase2.room.accept')}</Button><Button variant="outline" onClick={()=>respondSeat(req,false)}>{t('sessions.phase2.room.reject')}</Button></div></Card>)}
  <div className="grid shrink-0 grid-cols-3 gap-1.5 rounded-2xl border border-violet-400/15 bg-[#10122e]/85 p-2 sm:grid-cols-4">
   {isModerator&&snapshot.status==='scheduled'?<Button onClick={()=>void changeState('start')}><Play className="me-2 size-4"/>{t('sessions.phase2.room.start')}</Button>:isModerator&&snapshot.status==='active'?<Button onClick={()=>setShowPauseConfirm(true)}><Pause className="me-2 size-4"/>{t('sessions.phase2.room.pause')}</Button>:isModerator&&snapshot.status==='paused'?<Button onClick={()=>void changeState('resume')}><Play className="me-2 size-4"/>{t('sessions.phase2.room.resume')}</Button>:<Button variant="outline" onClick={()=>void askPause()}>{t('sessions.phase2.room.pauseRequest')}</Button>}
   <Button variant="outline" onClick={()=>void toggleFocusMode()}>{isFocus?t('sessions.phase2.room.collaboration'):t('sessions.phase2.room.focus')}</Button>
   {currentUserSeat?<Button onClick={()=>setMicEnabled(v=>!v)}><Mic className="me-2 size-4"/>{micEnabled?'كتم الميكروفون':'فتح الميكروفون'}</Button>:<Button variant="outline" onClick={()=>setShowRoster(true)}><Headphones className="me-2 size-4"/>{t('sessions.phase2.room.requestSeat')}</Button>}
   {currentUserSeat?<Button variant="outline" onClick={()=>void releaseSharedSpeakerSeat(id).then(()=>{setMicEnabled(false);return refresh()}).catch(e=>toast.error(e instanceof Error?e.message:'SEAT_RELEASE_FAILED'))}><MicOff className="me-2 size-4"/>{t('sessions.phase2.room.releaseSeat')}</Button>:null}
   <Button variant="outline" onClick={()=>setMuteAll(v=>!v)}>{muteAll?<VolumeX className="me-2 size-4"/>:<Volume2 className="me-2 size-4"/>}{muteAll?'إلغاء كتم الكل':'كتم صوت الكل'}</Button>
   <Button variant="danger" onClick={()=>void onLeave()}><LogOut className="me-2 size-4"/>{t('sessions.phase2.room.leave')}</Button>
  </div>
  {null}
  {showPauseConfirm?<div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"><Card className="w-full max-w-sm border-violet-400/30 bg-[#111333] p-5"><div className="mb-2 flex items-center gap-2"><Pause className="size-5 text-violet-300"/><strong>هل تريد طلب إيقاف مؤقت؟</strong></div><p className="text-sm text-slate-300">سيظهر تصويت للجميع لمدة دقيقة، ويتوقف المؤقت عند موافقة الأغلبية.</p><div className="mt-4 grid grid-cols-2 gap-2"><Button variant="outline" onClick={()=>setShowPauseConfirm(false)}>لأ</Button><Button onClick={()=>void confirmPauseVote()}>آه، اطلب التصويت</Button>{isModerator?<Button className="col-span-2" variant="danger" onClick={()=>{setShowPauseConfirm(false);void changeState('pause')}}>إيقاف فوري للمشرف</Button>:null}</div></Card></div>:null}
  {showPauseVote&&pauseRequests.length>0?<div className="fixed inset-0 z-[81] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"><Card className="max-h-[80dvh] w-full max-w-md overflow-y-auto border-violet-400/30 bg-[#111333] p-4"><div className="mb-3 flex items-center justify-between"><strong>تصويت إيقاف المؤقت</strong><button type="button" onClick={()=>setShowPauseVote(false)} className="grid size-9 place-items-center rounded-full bg-white/5" aria-label="Close pause vote"><X className="size-4"/></button></div>{pauseRequests.map(request=><div key={request.id} className="rounded-xl border border-white/10 p-3"><p className="text-sm">هل توافق على إيقاف المؤقت؟</p><p className="mt-1 text-xs text-muted-foreground">{request.yes_count} موافق · {request.no_count} رافض · {request.electorate.length} مشارك · متبقي {Math.max(0,Math.ceil((new Date(request.expires_at).getTime()-now)/1000))} ث</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-violet-500 to-cyan-400" style={{width:Math.min(100,Math.round((request.yes_count/request.electorate.length)*100))+'%'}}/></div><div className="mt-3 flex gap-2"><Button className="flex-1" onClick={()=>void votePause(request,'yes')}>آه</Button><Button className="flex-1" variant="outline" onClick={()=>void votePause(request,'no')}>لأ</Button></div></div>)}</Card></div>:null}
  {showTimerAdjust?<div className="fixed inset-0 z-[82] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center"><Card className="max-h-[85dvh] w-full max-w-md overflow-y-auto border-violet-400/30 bg-[#111333] p-4"><div className="mb-3 flex items-center justify-between"><strong className="flex items-center gap-2"><Timer className="size-5 text-violet-300"/>تعديل وقت الجلسة</strong><button type="button" onClick={()=>setShowTimerAdjust(false)} className="grid size-9 place-items-center rounded-full bg-white/5" aria-label="Close timer controls"><X className="size-4"/></button></div>{isModerator&&(snapshot.status==='active'||snapshot.status==='paused')?<><p className="text-sm text-slate-300">اختر الزيادة أو النقصان. لن يتغير الوقت إلا بعد موافقة نصف الأعضاء الآخرين المطلوبين.</p><div className="mt-3 grid grid-cols-3 gap-2"><Button variant="outline" onClick={()=>void proposeTimeChange(-900)}>-15 د</Button><Button variant="outline" onClick={()=>void proposeTimeChange(600)}>+10 د</Button><Button variant="outline" onClick={()=>void proposeTimeChange(3300)}>+55 د</Button></div><div className="mt-4 rounded-xl bg-white/5 p-3"><div className="flex justify-between text-sm"><span>تعديل مخصص</span><strong dir="ltr">{timeDelta/60>0?'+':''}{timeDelta/60} min</strong></div><input className="mt-3 w-full accent-violet-500" type="range" min="-480" max="480" step="5" value={timeDelta/60} onChange={e=>setTimeDelta(Number(e.target.value)*60)} aria-label="Custom session duration adjustment"/><Button className="mt-3 w-full" disabled={timeDelta===0} onClick={()=>void proposeTimeChange(timeDelta)}>طلب تعديل الوقت</Button></div></>:<p className="text-sm text-slate-300">طلبات تعديل الوقت تنتظر موافقتك هنا.</p>}{timeRequests.map(request=><div key={request.id} className="mt-3 rounded-xl border border-white/10 p-3"><p className="text-sm">{participants.find(person=>person.user_id===request.requested_by)?.display_name??'المشرف'} يريد {request.delta_seconds>0?'إضافة':'تقليل'} {Math.abs(request.delta_seconds)/60} دقيقة.</p><p className="mt-1 text-xs text-muted-foreground">{request.yes_count} موافق · {request.no_count} رافض · المطلوب {Math.ceil((request.electorate.length+1)/2)} من {request.electorate.length+1} · متبقي {Math.max(0,Math.ceil((new Date(request.expires_at).getTime()-now)/1000))} ث</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-violet-500 to-cyan-400" style={{width:Math.min(100,Math.round((request.yes_count/request.electorate.length)*100))+'%'}}/></div>{request.requested_by===userId?<p className="mt-3 text-xs text-cyan-200">طلبك — بانتظار موافقة الأعضاء</p>:<div className="mt-3 flex gap-2"><Button className="flex-1" onClick={()=>void voteTimeChange(request,'yes')}>آه</Button><Button className="flex-1" variant="outline" onClick={()=>void voteTimeChange(request,'no')}>لأ</Button></div>}</div>)}</Card></div>:null}
  {rtcError?<div className="fixed inset-x-3 top-20 z-[60] mx-auto max-w-lg rounded-xl border border-rose-400/30 bg-[#211127] p-3 text-xs text-rose-200">{rtcError==='AGORA_NOT_CONFIGURED'?'Agora غير مهيأ على الخادم. يجب ضبط AGORA_APP_ID و AGORA_APP_CERTIFICATE في Supabase Edge Function Secrets. لا ترسل الشهادة السرية في المحادثة.':rtcError==='AGORA_SDK_LOAD_FAILED'?'تعذر تحميل Agora Web SDK. تحقق من اتصال الإنترنت وسياسة تحميل السكربت.':rtcError}</div>:null}
  {showRoster?<div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center"><Card className="max-h-[82dvh] w-full max-w-md overflow-y-auto border-violet-400/30 bg-[#111333] p-4"><div className="mb-3 flex items-center justify-between"><strong className="text-base">{t('sessions.phase2.room.present')} · {snapshot.participant_count}</strong><button type="button" onClick={()=>setShowRoster(false)} className="grid size-9 place-items-center rounded-full bg-white/5" aria-label="Close participant list"><X className="size-4"/></button></div><p className="mb-3 text-xs text-muted-foreground">النقطة الخضراء = مقعد صوت · الصفراء = مستمع</p><div className="space-y-2">{presentParticipants.map(person=>{const speaker=seated.has(person.user_id);const muted=mutedUserIds.includes(person.user_id);return <div key={person.id} className="rounded-xl bg-white/[0.035] p-2"><button type="button" onClick={()=>speaker&&person.user_id!==userId?void requestSeat(person):undefined} className="flex w-full items-center gap-3 text-start"><span className={cn('size-2.5 shrink-0 rounded-full',speaker?'bg-emerald-400':'bg-amber-400')}/>{person.avatar_url?<img src={person.avatar_url} alt="" className="size-9 rounded-full object-cover"/>:<span className="grid size-9 place-items-center rounded-full bg-violet-500/20">{person.display_name.slice(0,1)}</span>}<span className="min-w-0 flex-1 truncate text-sm">{person.display_name}</span>{person.whiteboard_open?<span className="text-[10px] text-cyan-300">داخل السبورة</span>:null}{person.focus_mode?<Target className="size-4 shrink-0 text-cyan-300" aria-label="Focus mode"/>:null}{speaker?<Headphones className="size-4 shrink-0 text-violet-300"/>:null}</button>{speaker&&person.user_id!==userId?<div className="mt-2 flex items-center gap-2 ps-6"><button type="button" onClick={()=>setMutedUserIds(list=>list.includes(person.user_id)?list.filter(id=>id!==person.user_id):[...list,person.user_id])} className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/5" aria-label={muted?'Unmute member':'Mute member'}>{muted?<VolumeX className="size-4"/>:<Volume2 className="size-4"/>}</button><input type="range" min="0" max="100" step="5" value={volumes[person.user_id]??100} onChange={e=>setVolumes(values=>({...values,[person.user_id]:Number(e.target.value)}))} className="min-w-0 flex-1 accent-violet-500" aria-label={'Volume '+person.display_name}/><span className="w-8 text-end text-[10px] tabular-nums">{volumes[person.user_id]??100}%</span></div>:null}</div>})}</div></Card></div>:null}
  {invitations.filter(i=>i.session_id!==id).map(inv=><div key={inv.invitation_id} className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"><Card className="w-full max-w-sm border-violet-400/30 bg-[#111333] p-5"><div className="mb-3 flex items-center gap-2 text-violet-300"><Users className="size-5"/><strong>{t('sessions.phase2.invitation.title')}</strong></div><p className="text-sm">{inv.title}</p><div className="mt-4 flex flex-col gap-2"><Button onClick={()=>respondInvitation(inv,true)}>{t('sessions.phase2.invitation.join')}</Button><Button variant="outline" onClick={()=>respondInvitation(inv,false)}><X className="me-2 size-4"/>{t('sessions.phase2.invitation.keepSolo')}</Button></div></Card></div>)}
 </main>
 </>
}
