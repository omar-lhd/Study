'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Check, UsersRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input, Label, Select, Textarea } from '@/components/ui/field'
import { OptionGroup } from '@/components/ui/option-group'
import { useT } from '@/components/providers/preferences-provider'
import {
  createSharedStudySession,
  listCommunityMemberProfiles,
  listMyStudyCommunities,
  type SharedSessionCreateInput,
} from './use-sessions'

type SessionKind = SharedSessionCreateInput['sessionType']
type Community = {id:string;name:string;created_by:string}
type CommunityProfile = {id:string;display_name:string;avatar_url:string|null;username:string|null}

function colorForSubject(value:string) {
  const palette=['#8B5CF6','#3B82F6','#06B6D4','#10B981','#F59E0B','#EC4899']
  if(!value.trim()) return null
  let hash=0
  for(const char of value) hash=(hash*31+char.charCodeAt(0))|0
  return palette[Math.abs(hash)%palette.length]
}

function localDateTime() {
  const date=new Date(Date.now()+60_000)
  const pad=(value:number)=>String(value).padStart(2,'0')
  return {date:`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`,time:`${pad(date.getHours())}:${pad(date.getMinutes())}`}
}

export function SharedSessionCreateDialog({trigger}:{trigger:React.ReactNode}) {
  const t=useT()
  const router=useRouter()
  const [open,setOpen]=useState(false)
  const [kind,setKind]=useState<SessionKind>('group')
  const [communities,setCommunities]=useState<Community[]>([])
  const [communityId,setCommunityId]=useState('')
  const [members,setMembers]=useState<CommunityProfile[]>([])
  const [inviteIds,setInviteIds]=useState<string[]>([])
  const [title,setTitle]=useState('')
  const [subject,setSubject]=useState('')
  const [description,setDescription]=useState('')
  const [duration,setDuration]=useState('45')
  const [timing,setTiming]=useState<'now'|'scheduled'>('now')
  const [date,setDate]=useState(localDateTime().date)
  const [time,setTime]=useState(localDateTime().time)
  const [goals,setGoals]=useState('')
  const [access,setAccess]=useState<'creator_only'|'invited'|'group'>('invited')
  const [loading,setLoading]=useState(false)
  const [loadingMembers,setLoadingMembers]=useState(false)

  useEffect(()=>{
    if(!open) return
    let alive=true
    listMyStudyCommunities().then(rows=>{
      if(!alive)return
      const memberCommunities=rows
      setCommunities(memberCommunities)
      setCommunityId(current=>current||memberCommunities[0]?.id||'')
    }).catch(()=>{if(alive)toast.error(t('sessions.phase2.room.loadError'))})
    return ()=>{alive=false}
  },[open,t])

  useEffect(()=>{
    if(!open||!communityId)return
    let alive=true
    setLoadingMembers(true)
    listCommunityMemberProfiles(communityId).then(rows=>{
      if(alive)setMembers(rows)
    }).catch(()=>{if(alive)setMembers([])}).finally(()=>{if(alive)setLoadingMembers(false)})
    return ()=>{alive=false}
  },[open,communityId])

  const invitedUsers=useMemo(()=>inviteIds.filter(id=>members.some(member=>member.id===id)),[inviteIds,members])

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(title.trim().length<2){toast.error(t('sessions.form.invalid'));return}
    if(kind!=='open_room'&&!communityId){toast.error(t('sessions.form.invalid'));return}
    if(kind==='private'&&!invitedUsers.length){toast.error(t('sessions.form.invalid'));return}
    const durationSeconds=Number(duration)*60
    if(!Number.isInteger(durationSeconds)||durationSeconds<300||durationSeconds>28800){toast.error(t('sessions.form.invalid'));return}
    const startsAt=timing==='scheduled'?new Date(`${date}T${time}:00`).toISOString():null
    if(startsAt&&Date.parse(startsAt)<=Date.now()){toast.error(t('sessions.form.invalid'));return}
    setLoading(true)
    try {
      const input:SharedSessionCreateInput={
        title:title.trim(),subject:subject.trim()||null,subjectColor:colorForSubject(subject),
        description:description.trim(),sessionType:kind,status:timing==='now'?'active':'scheduled',
        accessType:kind==='open_room'?'group':kind==='group'?access:'invited',
        startsAt,durationSeconds,invitedUsers:kind==='open_room'?[]:invitedUsers,
        goals:goals.split('\n').map(value=>value.trim()).filter(Boolean).slice(0,20),
      }
      const id=await createSharedStudySession(input)
      toast.success(kind==='open_room'?t('sessions.phase2.type.openRoom'):t('sessions.phase2.type.group'))
      setOpen(false)
      router.push(`/study/sessions/${id}`)
    } catch(error) {
      toast.error(error instanceof Error?error.message:t('sessions.phase2.room.loadError'))
    } finally {setLoading(false)}
  }

  const options=[
    {value:'private' as const,label:t('sessions.phase2.type.private')},
    {value:'group' as const,label:t('sessions.phase2.type.group')},
    {value:'open_room' as const,label:t('sessions.phase2.type.openRoom')},
  ]

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>{trigger}</DialogTrigger>
    <DialogContent className="max-h-[88dvh] overflow-y-auto rounded-[1.75rem] border-primary/20 bg-elevated/95 shadow-2xl backdrop-blur-2xl">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-primary/15 text-primary"><UsersRound className="size-5"/></span>
        <div><DialogTitle>{t('sessions.phase2.createTitle')}</DialogTitle><DialogDescription>{t('sessions.phase2.sharedNotice')}</DialogDescription></div>
      </div>
      <form onSubmit={submit} className="grid gap-4">
        <div>
          <Label>{t('sessions.phase2.sessionType')}</Label>
          <OptionGroup<SessionKind> label={t('sessions.phase2.sessionType')} value={kind} onChange={value=>{setKind(value);setAccess(value==='open_room'?'group':'invited')}} options={options}/>
        </div>
        <div><Label htmlFor="phase2-session-title">{t('sessions.form.field.title')}</Label><Input id="phase2-session-title" value={title} onChange={event=>setTitle(event.target.value)} minLength={2} maxLength={100} required/></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="phase2-session-subject">{t('sessions.form.field.subject')}</Label><Input id="phase2-session-subject" value={subject} onChange={event=>setSubject(event.target.value)} maxLength={60}/></div>
          <div><Label htmlFor="phase2-session-duration">{t('sessions.form.field.duration')}</Label><Select id="phase2-session-duration" value={duration} onChange={event=>setDuration(event.target.value)}><option value="25">25 min</option><option value="45">45 min</option><option value="60">60 min</option><option value="90">90 min</option><option value="120">120 min</option><option value="180">180 min</option><option value="240">240 min</option><option value="360">360 min</option><option value="480">480 min</option></Select></div>
        </div>
        <div><Label htmlFor="phase2-session-description">{t('sessions.form.field.note')}</Label><Textarea id="phase2-session-description" value={description} onChange={event=>setDescription(event.target.value)} maxLength={1000}/></div>
        <div className="grid gap-2">
          <Label>{t('sessions.phase2.startTime')}</Label>
          <OptionGroup<'now'|'scheduled'> label={t('sessions.phase2.startTime')} value={timing} onChange={setTiming} options={[{value:'now',label:t('sessions.form.mode.instant')},{value:'scheduled',label:t('sessions.form.mode.scheduled')}]}/>
          {timing==='scheduled'?<div className="grid grid-cols-2 gap-2"><Input aria-label={t('sessions.form.field.date')} type="date" min={localDateTime().date} value={date} onChange={event=>setDate(event.target.value)}/><Input aria-label={t('sessions.form.field.time')} type="time" value={time} onChange={event=>setTime(event.target.value)}/></div>:null}
        </div>
        {kind==='private'||kind==='group'?<div className="grid gap-2">
          <Label htmlFor="phase2-community">{t('sessions.phase2.community')}</Label>
          <Select id="phase2-community" value={communityId} onChange={event=>{setCommunityId(event.target.value);setInviteIds([])}}>{communities.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</Select>
          <div className="max-h-44 overflow-y-auto rounded-2xl border border-border p-2">
            {loadingMembers?<p className="p-2 text-xs text-muted-foreground">{t('sessions.loading')}</p>:members.map(member=><label key={member.id} className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-sm hover:bg-secondary">
              <input type="checkbox" checked={inviteIds.includes(member.id)} onChange={event=>setInviteIds(current=>event.target.checked?[...current,member.id]:current.filter(id=>id!==member.id))}/>
              <span className="min-w-0 flex-1 truncate">{member.display_name}{member.username?` · @${member.username}`:''}</span>
            </label>)}
            {!members.length&&!loadingMembers?<p className="p-2 text-xs text-muted-foreground">{t('sessions.phase2.noMembers')}</p>:null}
          </div>
          {kind==='group'?<div><Label>{t('sessions.phase2.access')}</Label><Select value={access} onChange={event=>setAccess(event.target.value as 'invited'|'group')}><option value="invited">{t('sessions.phase2.inviteOnly')}</option><option value="group">{t('sessions.phase2.communityAccess')}</option></Select></div>:null}
        </div>:null}
        {kind==='open_room'?<p className="rounded-xl bg-primary/10 p-3 text-sm text-muted-foreground">{t('sessions.phase2.openRoomDescription')}</p>:null}
        <div><Label htmlFor="phase2-session-goals">{t('sessions.phase2.goals')} · {t('sessions.form.field.goals')}</Label><Textarea id="phase2-session-goals" value={goals} onChange={event=>setGoals(event.target.value)} placeholder={t('sessions.phase2.room.goalPlaceholder')}/></div>
        <Button type="submit" disabled={loading||loadingMembers||(kind!=='open_room'&&!communityId)} className="w-full"><Check className="size-4" aria-hidden="true"/>{loading?t('common.loading'):t('sessions.phase2.create')}</Button>
      </form>
    </DialogContent>
  </Dialog>
}
