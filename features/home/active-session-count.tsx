'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Radio, Users } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { listMySharedSessions } from '@/features/study/sessions/use-sessions'

export function ActiveSessionCount(){
  const [count,setCount]=useState(0)
  const [loading,setLoading]=useState(true)
  const refresh=useCallback(async()=>{
    try{
      const sessions=await listMySharedSessions()
      setCount(sessions.filter(session=>session.status==='active'||session.status==='paused').length)
    }catch{setCount(0)}
    finally{setLoading(false)}
  },[])
  useEffect(()=>{
    void refresh()
    const timer=window.setInterval(()=>void refresh(),15000)
    const handle=()=>{if(document.visibilityState==='visible')void refresh()}
    window.addEventListener('focus',handle)
    document.addEventListener('visibilitychange',handle)
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',handle);document.removeEventListener('visibilitychange',handle)}
  },[refresh])
  return <Card className="border-primary/20 bg-gradient-to-r from-primary/10 via-card/80 to-cyan-500/5">
    <Link href="/study" className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary"><Radio className="size-5"/></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">جلسات المذاكرة النشطة</span><span className="mt-0.5 block text-xs text-muted-foreground">{loading?'جاري التحقق…':count>0?'فيه جلسات شغالة تقدر تنضم لها':'مفيش جلسات نشطة دلوقتي'}</span></span>
      <span className="flex items-center gap-1.5 text-lg font-bold tabular-nums text-primary">{loading?'—':count}<Users className="size-4"/><ArrowUpRight className="size-4"/></span>
    </Link>
  </Card>
}
