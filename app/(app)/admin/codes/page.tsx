'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, BadgeCheck, Ban, BarChart3, Clipboard, Copy, Download, KeyRound, Layers3, LoaderCircle, Plus, RefreshCw, Search, Shield, ShieldCheck, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/field'
import { invokeAdminFunction } from '@/lib/chats/cloud-client'

type Group = { id: string; name: string }
type Summary = { total: number; available: number; redeemed: number; expired: number; revoked: number }
type Code = { id: string; group_id: string; batch_id: string|null; code_label: string; created_at: string; expires_at: string|null; used_at: string|null; used_by: string|null; revoked_at: string|null; internal_note: string; status: string }
type Batch = { id: string; name: string; description: string; purpose: string; group_id: string; created_at: string; expires_at: string|null; summary: Summary }
type Audit = { id: number; actor_id: string|null; action: string; metadata: Record<string,unknown>; created_at: string }
type Admin = { user_id: string; email: string|null; created_at: string }
type Tab = 'overview'|'generate'|'codes'|'batches'|'audit'|'admins'
const emptySummary: Summary = { total:0,available:0,redeemed:0,expired:0,revoked:0 }
const statusNames: Record<string,string> = { available:'Available',redeemed:'Redeemed',expired:'Expired',revoked:'Revoked' }

function downloadCsv(rows: string[][], filename: string) {
  const csv = rows.map(row=>row.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(',')).join('\r\n')
  const blob = new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'})
  const url=URL.createObjectURL(blob), a=document.createElement('a')
  a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url)
}
function Metric({label,value,icon:Icon,accent}:{label:string;value:number;icon:typeof KeyRound;accent?:string}) {
  return <Card className="flex items-center gap-4"><div className={'flex size-11 items-center justify-center rounded-xl bg-secondary '+(accent||'')}><Icon className="size-5"/></div><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p></div></Card>
}
function Pill({status}:{status:string}) {
  const cls=status==='available'?'bg-emerald-500/10 text-emerald-600':status==='redeemed'?'bg-blue-500/10 text-blue-600':status==='expired'?'bg-amber-500/10 text-amber-600':'bg-red-500/10 text-red-600'
  return <span className={'inline-flex rounded-full px-2.5 py-1 text-xs font-medium '+cls}>{statusNames[status]||status}</span>
}

export default function CodeAdminPage() {
  const [tab,setTab]=useState<Tab>('overview')
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [summary,setSummary]=useState<Summary>(emptySummary)
  const [groups,setGroups]=useState<Group[]>([])
  const [activity,setActivity]=useState<{date:string;count:number}[]>([])
  const [recent,setRecent]=useState<Audit[]>([])
  const [batches,setBatches]=useState<Batch[]>([])
  const [codes,setCodes]=useState<Code[]>([])
  const [total,setTotal]=useState(0)
  const [page,setPage]=useState(1)
  const [search,setSearch]=useState('')
  const [filter,setFilter]=useState('all')
  const [batchFilter,setBatchFilter]=useState('')
  const [groupFilter,setGroupFilter]=useState('')
  const [dateFrom,setDateFrom]=useState('')
  const [dateTo,setDateTo]=useState('')
  const [admins,setAdmins]=useState<Admin[]>([])
  const [auditRows,setAuditRows]=useState<Audit[]>([])
  const [auditFilter,setAuditFilter]=useState('')
  const [generated,setGenerated]=useState<{batch:Batch;codes:string[];codeIds:string[]}|null>(null)
  const [form,setForm]=useState({batchName:'',description:'',purpose:'',groupId:'',count:'10',codeLength:'16',prefix:'',label:'',note:'',expiresAt:''})
  const [newAdmin,setNewAdmin]=useState('')
  const [newGroupName,setNewGroupName]=useState('')
  const [noteEdit,setNoteEdit]=useState<{id:string;note:string}|null>(null)
  const [showCodes,setShowCodes]=useState(false)

  const call=useCallback(async <T,>(payload:Record<string,unknown>)=>invokeAdminFunction<T>(payload),[])
  const loadOverview=useCallback(async()=>{
    setLoading(true);setError('')
    try {
      const data=await call<{summary:Summary;activity:{date:string;count:number}[];recent:Audit[];batches:Batch[];groups:Group[]}>({action:'overview'})
      setSummary(data.summary);setActivity(data.activity);setRecent(data.recent);setBatches(data.batches);setGroups(data.groups)
      setForm(v=>({...v,groupId:v.groupId||data.groups[0]?.id||''}))
    } catch(e) {setError(e instanceof Error?e.message:'Could not load dashboard')}
    finally{setLoading(false)}
  },[call])
  const loadCodes=useCallback(async()=>{
    setBusy(true);setError('')
    try{
      const data=await call<{items:Code[];total:number}>({action:'list_codes',page,pageSize:25,search:search.trim(),batchId:batchFilter||undefined,groupId:groupFilter||undefined,status:filter==='all'?undefined:filter,dateFrom:dateFrom||undefined,dateTo:dateTo||undefined})
      setCodes(data.items);setTotal(data.total)
    }catch(e){setError(e instanceof Error?e.message:'Could not load codes')}
    finally{setBusy(false)}
  },[call,page,search,batchFilter,groupFilter,filter,dateFrom,dateTo])
  const loadBatches=useCallback(async()=>{try{const d=await call<{items:Batch[]}>({action:'batches'});setBatches(d.items)}catch(e){setError(e instanceof Error?e.message:'Could not load batches')}},[call])
  const loadAudit=useCallback(async()=>{try{const d=await call<{items:Audit[]}>({action:'audit',page:1,pageSize:50,actionFilter:auditFilter||undefined});setAuditRows(d.items)}catch(e){setError(e instanceof Error?e.message:'Could not load audit logs')}},[call,auditFilter])
  const loadAdmins=useCallback(async()=>{try{const d=await call<{admins:Admin[]}>({action:'list_admins'});setAdmins(d.admins)}catch(e){setError(e instanceof Error?e.message:'Could not load administrators')}},[call])
  useEffect(()=>{void loadOverview()},[loadOverview])
  useEffect(()=>{if(tab==='codes')void loadCodes()},[tab,loadCodes])
  useEffect(()=>{if(tab==='batches')void loadBatches()},[tab,loadBatches])
  useEffect(()=>{if(tab==='audit')void loadAudit()},[tab,loadAudit])
  useEffect(()=>{if(tab==='admins')void loadAdmins()},[tab,loadAdmins])

  const notify=(message:string)=>{setNotice(message);window.setTimeout(()=>setNotice(''),3500)}
  const copy=async(value:string)=>{try{await navigator.clipboard.writeText(value);notify('Copied to clipboard')}catch{setError('Clipboard access was denied')}}
  const generate=async()=>{
    if(!form.groupId){setError('There is no group to associate codes with yet. Create a group in the community first.');return}
    setBusy(true);setError('');setGenerated(null)
    try{
      const d=await call<{batch:Batch;codes:string[];codeIds:string[]}>({action:'generate',...form,count:Number(form.count),codeLength:Number(form.codeLength),expiresAt:form.expiresAt||null})
      setGenerated(d);setShowCodes(true);notify('Batch generated successfully');await loadOverview()
    }catch(e){setError(e instanceof Error?e.message:'Generation failed')}
    finally{setBusy(false)}
  }
  const revokeCode=async(id:string)=>{
    if(!window.confirm('Revoke this unused invitation code? This cannot be undone.'))return
    setBusy(true);try{await call({action:'revoke_code',codeId:id});notify('Code revoked');await loadCodes();await loadOverview()}catch(e){setError(e instanceof Error?e.message:'Revoke failed')}finally{setBusy(false)}
  }
  const revokeBatch=async(id:string)=>{
    if(!window.confirm('Revoke all unused codes in this batch? Redeemed codes will not be changed.'))return
    setBusy(true);try{const d=await call<{revokedCount:number}>({action:'revoke_batch',batchId:id});notify(d.revokedCount+' unused codes revoked');await loadBatches();await loadOverview()}catch(e){setError(e instanceof Error?e.message:'Batch revoke failed')}finally{setBusy(false)}
  }
  const saveNote=async()=>{if(!noteEdit)return;setBusy(true);try{await call({action:'update_note',codeId:noteEdit.id,note:noteEdit.note});setNoteEdit(null);notify('Note saved');await loadCodes()}catch(e){setError(e instanceof Error?e.message:'Could not save note')}finally{setBusy(false)}}
  const addAdmin=async()=>{setBusy(true);try{await call({action:'add_admin',userId:newAdmin.trim()});setNewAdmin('');notify('Administrator added');await loadAdmins()}catch(e){setError(e instanceof Error?e.message:'Could not add administrator')}finally{setBusy(false)}}
  const createGroup=async()=>{const name=newGroupName.trim();if(name.length<2)return;setBusy(true);try{const d=await call<{group:Group}>({action:'create_group',name});setGroups(g=>[d.group,...g]);setForm(v=>({...v,groupId:d.group.id}));setNewGroupName('');notify('Group created');await loadOverview()}catch(e){setError(e instanceof Error?e.message:'Could not create group')}finally{setBusy(false)}}
  const revokeAdmin=async(id:string)=>{if(!window.confirm('Revoke this administrator’s code-management access?'))return;setBusy(true);try{await call({action:'revoke_admin',userId:id});notify('Administrator access revoked');await loadAdmins()}catch(e){setError(e instanceof Error?e.message:'Could not revoke administrator')}finally{setBusy(false)}}

  const tabs: {id:Tab;label:string;icon:typeof KeyRound}[]=[{id:'overview',label:'Overview',icon:BarChart3},{id:'generate',label:'Generate',icon:Plus},{id:'codes',label:'Codes',icon:KeyRound},{id:'batches',label:'Batches',icon:Layers3},{id:'audit',label:'Audit log',icon:Activity},{id:'admins',label:'Administrators',icon:ShieldCheck}]
  const maxActivity=Math.max(1,...activity.map(a=>a.count))
  const statusCounts=useMemo(()=>summary,[summary])

  if(loading)return <div className="flex min-h-64 items-center justify-center gap-3 text-muted-foreground"><LoaderCircle className="size-5 animate-spin"/>Loading secure dashboard…</div>
  if(error.includes('Administrator access required')||error.includes('Invalid session'))return <Card className="mx-auto mt-12 max-w-xl text-center"><Shield className="mx-auto mb-3 size-10 text-muted-foreground"/><h1 className="text-xl font-semibold">Administrator access required</h1><p className="mt-2 text-sm text-muted-foreground">This private code-management area is restricted to explicitly authorized administrators.</p></Card>

  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Private Study Community</p><h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Invitation code management</h1><p className="mt-1 text-sm text-muted-foreground">Generate, distribute, monitor and revoke access codes securely.</p></div><Button variant="outline" onClick={()=>{void loadOverview();if(tab==='codes')void loadCodes()}}><RefreshCw className="size-4"/>Refresh</Button></div>
    {error&&<div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger"><span>{error}</span><button onClick={()=>setError('')} aria-label="Dismiss"><X className="size-4"/></button></div>}
    {notice&&<div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">{notice}</div>}
    <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1.5">{tabs.map(t=><button key={t.id} onClick={()=>{setTab(t.id);setError('')}} className={'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition '+(tab===t.id?'bg-primary text-primary-foreground shadow-sm':'text-muted-foreground hover:bg-secondary hover:text-foreground')}><t.icon className="size-4"/>{t.label}</button>)}</div>
    {tab==='overview'&&<div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5"><Metric label="Total codes" value={statusCounts.total} icon={KeyRound}/><Metric label="Available" value={statusCounts.available} icon={BadgeCheck}/><Metric label="Redeemed" value={statusCounts.redeemed} icon={Users}/><Metric label="Expired" value={statusCounts.expired} icon={Activity}/><Metric label="Revoked" value={statusCounts.revoked} icon={Ban}/></div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]"><Card><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Code generation activity</h2><span className="text-xs text-muted-foreground">By creation date</span></div>{activity.length===0?<p className="py-10 text-center text-sm text-muted-foreground">No codes generated yet.</p>:<div className="flex h-40 items-end gap-1.5 overflow-x-auto border-b border-border pb-2">{activity.map(a=><div key={a.date} title={a.date+': '+a.count} className="flex min-w-3 flex-1 flex-col items-center justify-end gap-1"><div className="w-full max-w-7 rounded-t bg-primary/80" style={{height:Math.max(4,a.count/maxActivity*125)}}/><span className="text-[9px] text-muted-foreground [writing-mode:vertical-rl]">{a.date.slice(5)}</span></div>)}</div>}</Card><Card><h2 className="mb-4 font-semibold">Recent activity</h2>{recent.length===0?<p className="py-8 text-center text-sm text-muted-foreground">Your administrative events will appear here.</p>:<div className="space-y-3">{recent.slice(0,6).map(a=><div key={a.id} className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0"><div><p className="text-sm font-medium">{a.action.replaceAll('_',' ')}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</p></div><Activity className="mt-1 size-4 text-muted-foreground"/></div>)}</div>}</Card></div>
      <Card><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Recent batches</h2><Button size="sm" onClick={()=>setTab('generate')}><Plus/>Generate batch</Button></div>{batches.length===0?<p className="py-8 text-center text-sm text-muted-foreground">No batches yet. Generate your first invitation batch.</p>:<div className="space-y-3">{batches.slice(0,5).map(b=><div key={b.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0"><div><p className="font-medium">{b.name}</p><p className="mt-1 text-xs text-muted-foreground">{b.purpose||'No purpose'} · {new Date(b.created_at).toLocaleDateString()}</p></div><div className="flex gap-3 text-xs text-muted-foreground"><span>{b.summary?.total||0} codes</span><span className="text-emerald-600">{b.summary?.available||0} available</span></div></div>)}</div>}</Card>
    </div>}
    {tab==='generate'&&<div className="grid gap-5 lg:grid-cols-[1fr_1fr]"><Card><div className="mb-5"><h2 className="text-lg font-semibold">Generate a new batch</h2><p className="mt-1 text-sm text-muted-foreground">Codes are cryptographically generated. Only hashes are persisted; plaintext is shown once.</p></div><div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><Label htmlFor="batchName">Batch name *</Label><Input id="batchName" value={form.batchName} onChange={e=>setForm({...form,batchName:e.target.value})} placeholder="e.g. Beta testers"/></div>
      <div><Label htmlFor="group">Group *</Label><select id="group" className="mt-1 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" value={form.groupId} onChange={e=>setForm({...form,groupId:e.target.value})}><option value="">Select group</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select>{groups.length===0&&<div className="mt-2 space-y-2 rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">No groups exist yet. Create one to generate group-bound codes. The creator becomes the normal owner of this new group; code-admin status itself does not grant group membership.</p><Input value={newGroupName} onChange={e=>setNewGroupName(e.target.value)} placeholder="New group name (2–80 characters)"/><Button size="sm" variant="outline" disabled={busy||newGroupName.trim().length<2} onClick={()=>void createGroup()}><Plus/>Create group</Button></div>}</div>
      <div><Label htmlFor="purpose">Purpose / audience</Label><Input id="purpose" value={form.purpose} onChange={e=>setForm({...form,purpose:e.target.value})} placeholder="Early access"/></div>
      <div><Label htmlFor="count">Number of codes (1–200)</Label><Input id="count" type="number" min="1" max="200" value={form.count} onChange={e=>setForm({...form,count:e.target.value})}/></div>
      <div><Label htmlFor="length">Code length (12–32)</Label><Input id="length" type="number" min="12" max="32" value={form.codeLength} onChange={e=>setForm({...form,codeLength:e.target.value})}/></div>
      <div><Label htmlFor="prefix">Readable prefix (optional)</Label><Input id="prefix" maxLength={8} value={form.prefix} onChange={e=>setForm({...form,prefix:e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'')})} placeholder="STUDY"/></div>
      <div><Label htmlFor="label">Code label (optional)</Label><Input id="label" value={form.label} onChange={e=>setForm({...form,label:e.target.value})} placeholder="Invite"/></div>
      <div className="sm:col-span-2"><Label htmlFor="description">Batch description</Label><Input id="description" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Internal description"/></div>
      <div className="sm:col-span-2"><Label htmlFor="note">Internal note</Label><Input id="note" value={form.note} onChange={e=>setForm({...form,note:e.target.value})} placeholder="Visible only to administrators"/></div>
      <div className="sm:col-span-2"><Label htmlFor="expires">Expiration (optional)</Label><Input id="expires" type="datetime-local" value={form.expiresAt} onChange={e=>setForm({...form,expiresAt:e.target.value})}/></div>
    </div><Button className="mt-5 w-full" disabled={busy||!form.batchName.trim()||!form.groupId} onClick={()=>void generate()}>{busy?<LoaderCircle className="animate-spin"/>:<KeyRound/>}Generate {Math.max(1,Math.min(200,Number(form.count)||1))} code(s)</Button></Card>
    <Card><h2 className="mb-3 text-lg font-semibold">Plaintext handling</h2><div className="space-y-3 text-sm text-muted-foreground"><p>🔐 The backend stores only SHA-256 hashes. The plaintext code cannot be retrieved later from the database.</p><p>📋 After generation, copy or export the codes before leaving this screen. The one-time result stays in this browser view only.</p><p>🛡️ Every code is single-use, group-bound, and checked for expiry and revocation during redemption.</p><p>📦 A batch makes it easy to label, track and revoke unused codes together.</p></div>{generated&&<div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-emerald-700">Batch created</p><p className="text-xs text-muted-foreground">{generated.batch.name} · {generated.codes.length} codes</p></div><Button size="sm" variant="outline" onClick={()=>void copy(generated.codes.join('\n'))}><Copy/>Copy all</Button></div><Button className="mt-3 w-full" variant="secondary" onClick={()=>downloadCsv([['Code','Batch','Purpose'],...generated.codes.map(c=>[c,generated.batch.name,generated.batch.purpose])],'study-codes-'+generated.batch.id+'.csv')}><Download/>Export CSV</Button><button className="mt-3 text-sm text-primary underline" onClick={()=>setShowCodes(v=>!v)}>{showCodes?'Hide plaintext codes':'Reveal codes in this session'}</button>{showCodes&&<div className="mt-3 max-h-56 space-y-2 overflow-auto rounded-lg bg-background p-2">{generated.codes.map((c,i)=><div key={i} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 font-mono text-xs"><span className="break-all">{c}</span><button aria-label="Copy code" onClick={()=>void copy(c)}><Copy className="size-4"/></button></div>)}</div>}</div>}</Card></div>}
    {tab==='codes'&&<Card><div className="mb-4 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute start-3 top-3 size-4 text-muted-foreground"/><Input className="ps-9" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search label or notes"/></div><select className="h-11 rounded-lg border border-border bg-background px-3 text-sm" value={batchFilter} onChange={e=>{setBatchFilter(e.target.value);setPage(1)}}><option value="">All batches</option>{batches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select><select className="h-11 rounded-lg border border-border bg-background px-3 text-sm" value={filter} onChange={e=>{setFilter(e.target.value);setPage(1)}}><option value="all">All statuses</option>{Object.keys(statusNames).map(s=><option key={s} value={s}>{statusNames[s]}</option>)}</select><select className="h-11 rounded-lg border border-border bg-background px-3 text-sm" value={groupFilter} onChange={e=>{setGroupFilter(e.target.value);setPage(1)}}><option value="">All groups</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select><Input aria-label="Created from" type="date" value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setPage(1)}} className="max-w-40"/><Input aria-label="Created to" type="date" value={dateTo} onChange={e=>{setDateTo(e.target.value);setPage(1)}} className="max-w-40"/></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-start text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-3 text-start">Code ID / Label</th><th className="p-3 text-start">Batch</th><th className="p-3 text-start">Created</th><th className="p-3 text-start">Expires</th><th className="p-3 text-start">Status</th><th className="p-3 text-end">Actions</th></tr></thead><tbody>{codes.map(c=><tr key={c.id} className="border-b border-border last:border-0"><td className="p-3"><p className="font-mono text-xs">{c.id.slice(0,8)}…</p><p className="mt-1 text-xs text-muted-foreground">{c.code_label||'—'}</p></td><td className="p-3 text-xs">{batches.find(b=>b.id===c.batch_id)?.name||'Legacy code'}</td><td className="p-3 text-xs">{new Date(c.created_at).toLocaleDateString()}</td><td className="p-3 text-xs">{c.expires_at?new Date(c.expires_at).toLocaleDateString():'Never'}</td><td className="p-3"><Pill status={c.status}/></td><td className="p-3 text-end"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={()=>setNoteEdit({id:c.id,note:c.internal_note})}>Note</Button>{c.status==='available'&&<Button size="sm" variant="danger" disabled={busy} onClick={()=>void revokeCode(c.id)}><Ban/>Revoke</Button>}</div></td></tr>)}</tbody></table>{codes.length===0&&<p className="py-10 text-center text-sm text-muted-foreground">No codes match these filters.</p>}</div><div className="mt-4 flex items-center justify-between text-sm text-muted-foreground"><span>{total} codes · Page {page} of {Math.max(1,Math.ceil(total/25))}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page<=1||busy} onClick={()=>setPage(p=>p-1)}>Previous</Button><Button size="sm" variant="outline" disabled={page>=Math.ceil(total/25)||busy} onClick={()=>setPage(p=>p+1)}>Next</Button></div></div></Card>}
    {tab==='batches'&&<div className="space-y-3">{batches.length===0?<Card><p className="py-8 text-center text-sm text-muted-foreground">No batches created yet.</p></Card>:batches.map(b=><Card key={b.id}><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div className="min-w-0"><h2 className="font-semibold">{b.name}</h2><p className="mt-1 text-sm text-muted-foreground">{b.description||b.purpose||'No description'}</p><p className="mt-2 text-xs text-muted-foreground">{new Date(b.created_at).toLocaleString()} · {b.expires_at?'Expires '+new Date(b.expires_at).toLocaleDateString():'No expiry'}</p><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded bg-secondary px-2 py-1">{b.summary?.total||0} total</span><span className="rounded bg-emerald-500/10 px-2 py-1 text-emerald-600">{b.summary?.available||0} available</span><span className="rounded bg-blue-500/10 px-2 py-1 text-blue-600">{b.summary?.redeemed||0} redeemed</span><span className="rounded bg-amber-500/10 px-2 py-1 text-amber-600">{b.summary?.expired||0} expired</span><span className="rounded bg-red-500/10 px-2 py-1 text-red-600">{b.summary?.revoked||0} revoked</span></div></div><Button variant="danger" disabled={busy||!b.summary?.available} onClick={()=>void revokeBatch(b.id)}><Ban/>Revoke unused</Button></div></Card>)}</div>}
    {tab==='audit'&&<Card><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="font-semibold">Administrative audit trail</h2><select className="h-10 rounded-lg border border-border bg-background px-3 text-sm" value={auditFilter} onChange={e=>setAuditFilter(e.target.value)}><option value="">All events</option>{['admin_access','batch_generated','code_revoked','batch_revoked','code_note_updated','code_redeemed','admin_added','admin_revoked'].map(a=><option key={a} value={a}>{a.replaceAll('_',' ')}</option>)}</select></div><div className="space-y-3">{auditRows.map(a=><div key={a.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0"><div><p className="text-sm font-medium">{a.action.replaceAll('_',' ')}</p><p className="mt-1 break-all font-mono text-xs text-muted-foreground">{a.actor_id||'system'} {a.metadata&&Object.keys(a.metadata).length?'· '+JSON.stringify(a.metadata):''}</p></div><time className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</time></div>)}{auditRows.length===0&&<p className="py-8 text-center text-sm text-muted-foreground">No audit events.</p>}</div></Card>}
    {tab==='admins'&&<div className="space-y-4"><Card><h2 className="font-semibold">Add an administrator</h2><p className="mt-1 text-sm text-muted-foreground">Use the exact Supabase Auth user UUID. Code-management privileges do not grant group membership or group-admin rights.</p><div className="mt-4 flex flex-col gap-3 sm:flex-row"><Input value={newAdmin} onChange={e=>setNewAdmin(e.target.value)} placeholder="Supabase Auth UUID" className="font-mono"/><Button disabled={busy||!newAdmin.trim()} onClick={()=>void addAdmin()}><Plus/>Add administrator</Button></div></Card><Card><h2 className="mb-4 font-semibold">Authorized administrators</h2>{admins.map(a=><div key={a.user_id} className="flex flex-col justify-between gap-3 border-b border-border py-3 first:pt-0 last:border-0 sm:flex-row sm:items-center"><div><p className="font-medium">{a.email||'Account'}</p><p className="mt-1 break-all font-mono text-xs text-muted-foreground">{a.user_id}</p><p className="mt-1 text-xs text-muted-foreground">Added {new Date(a.created_at).toLocaleDateString()}</p></div><Button variant="danger" size="sm" disabled={busy||a.user_id===admins[0]?.user_id&&admins.length===1} onClick={()=>void revokeAdmin(a.user_id)}><Shield/>Revoke access</Button></div>)}</Card></div>}
    {noteEdit&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><Card className="w-full max-w-lg"><h2 className="font-semibold">Edit internal note</h2><p className="mt-1 text-xs text-muted-foreground">This note is visible to code administrators only.</p><textarea className="mt-4 min-h-32 w-full rounded-lg border border-border bg-background p-3 text-sm" maxLength={1000} value={noteEdit.note} onChange={e=>setNoteEdit({...noteEdit,note:e.target.value})}/><div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={()=>setNoteEdit(null)}>Cancel</Button><Button disabled={busy} onClick={()=>void saveNote()}>Save note</Button></div></Card></div>}
  </div>
}
