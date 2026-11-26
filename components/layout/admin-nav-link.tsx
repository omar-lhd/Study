'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { invokeAdminFunction } from '@/lib/chats/cloud-client'

export function AdminNavLink() {
  const [allowed,setAllowed]=useState(false)
  useEffect(()=>{
    void invokeAdminFunction<{authorized:boolean}>({action:'check_access'})
      .then(result=>setAllowed(result.authorized))
      .catch(()=>setAllowed(false))
  },[])
  if(!allowed)return null
  return <Link href="/admin/codes" aria-label="Invitation code administration" title="Invitation code administration" className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"><ShieldCheck className="size-4 shrink-0"/><span className="hidden lg:inline">Code administration</span></Link>
}
