'use client'

import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import { ArrowRight, KeyRound, MailCheck, ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { usePreferences } from '@/components/providers/preferences-provider'
import { readCloudSession, requestEmailOtp, signOutCloud, subscribeCloudSession, verifyEmailOtp } from '@/lib/chats/cloud-client'

export function ChatsAuthPanel() {
  const session = useSyncExternalStore(subscribeCloudSession, readCloudSession, () => null)
  const { t } = usePreferences()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener('study:open-auth', show)
    return () => window.removeEventListener('study:open-auth', show)
  }, [])

  function requestError(cause: unknown) {
    const message = cause instanceof Error ? cause.message.toLowerCase() : ''
    if (message.includes('rate') || message.includes('too many')) return t('cloud.auth.error.rateLimited')
    if (message.includes('invalid email') || message.includes('email address')) return t('cloud.auth.error.invalidEmail')
    return t('cloud.error.requestCode')
  }

  function verificationError(cause: unknown) {
    const message = cause instanceof Error ? cause.message.toLowerCase() : ''
    if (message.includes('expired')) return t('cloud.auth.error.expiredCode')
    if (message.includes('invalid') || message.includes('otp') || message.includes('token')) return t('cloud.auth.error.invalidCode')
    return t('cloud.error.verifyCode')
  }

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setError(''); setStatus('')
    try {
      await requestEmailOtp(email)
      setSent(true)
      setStatus(t('cloud.auth.otpRequested'))
    } catch (cause) {
      setError(requestError(cause))
    } finally { setBusy(false) }
  }

  async function resendCode() {
    setBusy(true); setError(''); setStatus('')
    try {
      await requestEmailOtp(email)
      setStatus(t('cloud.auth.otpRequested'))
    } catch (cause) {
      setError(requestError(cause))
    } finally { setBusy(false) }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setError(''); setStatus('')
    try {
      await verifyEmailOtp(email, code)
      setOpen(false)
      setStatus(t('cloud.auth.signedInStatus'))
    } catch (cause) {
      setError(verificationError(cause))
    } finally { setBusy(false) }
  }

  return (
    <>
      {session ? (
        <div className="flex items-center gap-2 rounded-full border border-border bg-card/80 py-1 ps-3 pe-1.5">
          <span className="hidden max-w-36 truncate text-xs text-muted-foreground sm:block">{session.user.email ?? t('cloud.auth.signedIn')}</span>
          <Button size="sm" variant="ghost" className="rounded-full" onClick={() => void signOutCloud()}>{t('cloud.auth.signOut')}</Button>
        </div>
      ) : (
        <Button size="sm" className="rounded-full px-4 shadow-panel" onClick={() => setOpen(true)}>
          <ShieldCheck data-icon="inline-start" />
          {t('cloud.auth.join')}
          <ArrowRight data-icon="inline-end" className="rtl:-scale-x-100" />
        </Button>
      )}

      <Dialog open={open && !session} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-3xl border-border bg-elevated p-5 sm:p-7">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary"><ShieldCheck className="size-6" /></div>
            <Button type="button" size="sm" variant="ghost" className="size-9 rounded-full p-0" aria-label={t('common.close')} onClick={() => setOpen(false)}><X className="size-4"/></Button>
          </div>
          <DialogTitle className="text-xl">{t('cloud.auth.title')}</DialogTitle>
          <DialogDescription className="mt-2 leading-relaxed">{t('cloud.auth.description')}</DialogDescription>
          {!sent ? (
            <form onSubmit={sendCode} className="mt-5 grid gap-3">
              <div className="grid gap-1.5"><Label htmlFor="psc-chat-email">{t('cloud.auth.email')}</Label><Input id="psc-chat-email" type="email" autoComplete="email" dir="ltr" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" /></div>
              <Button type="submit" className="mt-1 w-full rounded-xl" disabled={busy || !email.trim()}><MailCheck data-icon="inline-start" />{busy ? t('cloud.auth.sending') : t('cloud.auth.sendCode')}</Button>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="mt-5 grid gap-3">
              <div className="grid gap-1.5"><Label htmlFor="psc-chat-code">{t('cloud.auth.code')}</Label><Input id="psc-chat-code" inputMode="numeric" autoComplete="one-time-code" dir="ltr" value={code} onChange={e => setCode(e.target.value.replace(/\\D/g, '').slice(0, 6))} required minLength={6} maxLength={6} pattern="[0-9]{6}" placeholder={t('cloud.auth.codePlaceholder')} /></div>
              <Button type="submit" className="w-full rounded-xl" disabled={busy || !code.trim()}><KeyRound data-icon="inline-start" />{busy ? t('cloud.auth.verifying') : t('cloud.auth.verifyCode')}</Button>
              <div className="flex flex-wrap items-center justify-between gap-2"><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void resendCode()}>{t('cloud.auth.sendCode')}</Button><Button type="button" variant="ghost" onClick={() => { setSent(false); setCode(''); setStatus(''); setError('') }}>{t('cloud.auth.changeEmail')}</Button></div>
            </form>
          )}
          {status ? <p role="status" className="mt-3 text-sm text-muted-foreground">{status}</p> : null}
          {error ? <p role="alert" className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
