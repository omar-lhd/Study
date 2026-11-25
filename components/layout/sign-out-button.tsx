'use client'

import { LogOut } from 'lucide-react'
import { usePreferences } from '@/components/providers/preferences-provider'
import { signOutCloud } from '@/lib/chats/cloud-client'

export function SignOutButton() {
  const { locale } = usePreferences()
  const label = locale === 'ar' ? 'تسجيل خروج' : 'Sign out'
  return <button type="button" onClick={() => signOutCloud()} aria-label={label} title={label} className="flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"><LogOut className="size-5"/><span className="sr-only">{label}</span></button>
}
