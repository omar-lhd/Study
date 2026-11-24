'use client'

import { useState, useSyncExternalStore, type FormEvent } from 'react'
import { KeyRound, MailCheck, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import { usePreferences } from '@/components/providers/preferences-provider'
import { readCloudSession, requestEmailOtp, signOutCloud, subscribeCloudSession, verifyEmailOtp } from '@/lib/chats/cloud-client'

export function ChatsAuthPanel() {
  const session = useSyncExternalStore(subscribeCloudSession, readCloudSession, () => null)
  const { t } = usePreferences()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setError(''); setStatus('')
    try {
      await requestEmailOtp(email)
      setSent(true)
      setStatus(t('cloud.auth.otpRequested'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('cloud.error.requestCode'))
    } finally { setBusy(false) }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setError(''); setStatus('')
    try {
      await verifyEmailOtp(email, code)
      setStatus(t('cloud.auth.signedInStatus'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('cloud.error.verifyCode'))
    } finally { setBusy(false) }
  }

  if (session) return (
    <section className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-panel">
      <div className="min-w-0"><p className="text-sm font-semibold">{t('cloud.auth.signedIn')}</p><p className="truncate text-xs text-muted-foreground">{session.user.email ?? session.user.id}</p><p className="mt-1 text-xs text-muted-foreground">{t('cloud.auth.membershipNote')}</p></div>
      <Button variant="outline" onClick={() => signOutCloud()}>{t('cloud.auth.signOut')}</Button>
    </section>
  )

  return (
    <section className="mb-5 rounded-2xl border border-border bg-card p-4 shadow-panel sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="size-5" /></span>
        <div className="min-w-0">
          <h2 className="font-semibold">{t('cloud.auth.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('cloud.auth.description')}</p>
        </div>
      </div>
      {!sent ? (
        <form onSubmit={sendCode} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid gap-1.5"><Label htmlFor="psc-chat-email">{t('cloud.auth.email')}</Label><Input id="psc-chat-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" /></div>
          <Button type="submit" disabled={busy || !email.trim()}><MailCheck data-icon="inline-start" />{busy ? 'Sending…' : 'Send sign-in code'}</Button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid gap-1.5"><Label htmlFor="psc-chat-code">{t('cloud.auth.code')}</Label><Input id="psc-chat-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} required minLength={6} placeholder="Enter the code from your email" /></div>
          <Button type="submit" disabled={busy || !code.trim()}><KeyRound data-icon="inline-start" />{busy ? 'Verifying…' : 'Verify code'}</Button>
        </form>
      )}
      {status ? <p role="status" className="mt-3 text-sm text-muted-foreground">{status}</p> : null}
      {error ? <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
    </section>
  )
}

