'use client'

import { useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react'
import { BookOpen, CheckCircle2, KeyRound, Mail, ShieldCheck, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import { usePreferences } from '@/components/providers/preferences-provider'
import { cloudRest, readCloudSession, requestEmailOtp, signOutCloud, subscribeCloudSession, verifyEmailOtp } from '@/lib/chats/cloud-client'
import { readOfflineSnapshot, writeOfflineSnapshot } from '@/lib/chats/offline-store'
import { OfflineOutboxSync } from './offline-outbox-sync'

type Stage = 'loading' | 'checking' | 'auth' | 'profile' | 'activation' | 'ready'
type Profile = { id: string; display_name: string; username: string | null; bio: string | null }
type Membership = { group_id: string; user_id: string }

export function AppAuthGate({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(subscribeCloudSession, readCloudSession, () => null)
  const { locale } = usePreferences()
  const ar = locale === 'ar'
  const [hydrated, setHydrated] = useState(false)
  const [stage, setStage] = useState<Stage>('loading')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => setHydrated(true), [])

  const userId = session?.user.id

  useEffect(() => {
    if (!hydrated) return
    if (!userId) {
      setStage('auth')
      setError('')
      return
    }

    let active = true
    setStage('checking')
    setError('')
    const loadAccess = async () => {
      try {
        if (!navigator.onLine) {
          const cached = await readOfflineSnapshot<{ approved: boolean; profileReady: boolean; checkedAt: number }>(`auth-access:${userId}`).catch(() => null)
          if (active && cached?.approved && cached.profileReady && Date.now() - cached.checkedAt < 7 * 24 * 60 * 60 * 1000) setStage('ready')
          else if (active) setStage('activation')
          return
        }
        const [profiles, memberships] = await Promise.all([
          cloudRest<Profile[]>(`profiles?select=id,display_name,username,bio&id=eq.${userId}&limit=1`),
          cloudRest<Membership[]>(`group_members?select=group_id,user_id&user_id=eq.${userId}&limit=1`),
        ])
        if (!active) return
        const profile = profiles[0]
        if (!profile || !profile.display_name?.trim() || profile.display_name === 'New member' || !profile.username?.trim()) {
          setDisplayName(profile?.display_name === 'New member' ? '' : profile?.display_name ?? '')
          setUsername(profile?.username ?? '')
          setBio(profile?.bio ?? '')
          setStage('profile')
          return
        }
        const approved = memberships.length > 0
        void writeOfflineSnapshot(`auth-access:${userId}`, { approved, profileReady: true, checkedAt: Date.now() }).catch(() => {})
        setStage(approved ? 'ready' : 'activation')
      } catch (cause) {
        if (!active) return
        if (!navigator.onLine) {
          const cached = await readOfflineSnapshot<{ approved: boolean; profileReady: boolean; checkedAt: number }>(`auth-access:${userId}`).catch(() => null)
          if (cached?.approved && cached.profileReady && Date.now() - cached.checkedAt < 7 * 24 * 60 * 60 * 1000) { setStage('ready'); return }
        }
        const message = cause instanceof Error ? cause.message : ''
        if (/expired|refresh token|invalid jwt/i.test(message)) {
          signOutCloud()
          setStage('auth')
        } else {
          setError(ar ? 'تعذر التحقق من حالة الحساب. تحقق من اتصال الإنترنت ثم أعد المحاولة.' : 'Could not verify account access. Check your connection and try again.')
          setStage('activation')
        }
      }
    }
    void loadAccess()
    return () => { active = false }
  }, [hydrated, userId, ar])

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setError(''); setStatus('')
    try {
      await requestEmailOtp(email, mode === 'signup')
      setSent(true)
      setStatus(ar ? 'بعتنالك كود التحقق على البريد الإلكتروني.' : 'We sent a verification code to your email.')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : ''
      if (/signups? not allowed|signup disabled|signups are disabled/i.test(message)) {
        setError(ar
          ? 'إنشاء الحسابات متوقف في إعدادات Supabase Auth. لازم تفعيل Allow new users to sign up من إعدادات Auth للمشروع.'
          : 'New account creation is disabled in Supabase Auth. Enable “Allow new users to sign up” in this project’s Auth settings.')
      } else if (/rate|too many/i.test(message)) {
        setError(ar ? 'طلبات كتير في وقت قصير. استنى شوية وجرب تاني.' : 'Too many requests. Please wait and try again.')
      } else {
        setError(message || (ar ? 'تعذر إرسال كود التحقق.' : 'Could not send the verification code.'))
      }
    } finally { setBusy(false) }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setError(''); setStatus('')
    try {
      await verifyEmailOtp(email, code)
      setStatus(ar ? 'تم التحقق من البريد. بنجهز حسابك…' : 'Email verified. Preparing your account…')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : ''
      setError(/expired/i.test(message)
        ? (ar ? 'الكود انتهت صلاحيته. اطلب كود جديد.' : 'That code expired. Request a new one.')
        : (ar ? 'الكود غير صحيح أو انتهت صلاحيته.' : 'The code is incorrect or has expired.'))
    } finally { setBusy(false) }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const cleanName = displayName.trim()
    const cleanUsername = username.trim().replace(/^@/, '').toLowerCase()
    if (cleanName.length < 2 || !/^[a-zA-Z0-9_]{3,24}$/.test(cleanUsername)) {
      setError(ar ? 'اكتب اسم ظاهر من حرفين على الأقل وUsername من 3 إلى 24 حرف/رقم أو _.' : 'Enter a display name (at least 2 characters) and a username of 3–24 letters, numbers or underscores.')
      return
    }
    if (!session) return
    setBusy(true); setError('')
    try {
      await cloudRest('profiles?on_conflict=id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ id: session.user.id, display_name: cleanName, username: cleanUsername, bio: bio.trim() }),
      })
      setDisplayName(cleanName); setUsername(cleanUsername)
      setStage('checking')
      const memberships = await cloudRest<Membership[]>(`group_members?select=group_id,user_id&user_id=eq.${session.user.id}&limit=1`)
      const approved = memberships.length > 0
      void writeOfflineSnapshot(`auth-access:${session.user.id}`, { approved, profileReady: true, checkedAt: Date.now() }).catch(() => {})
      setStage(approved ? 'ready' : 'activation')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : ''
      setError(/unique|duplicate/i.test(message)
        ? (ar ? 'اسم المستخدم ده مستخدم بالفعل. اختار اسم تاني.' : 'That username is already taken. Choose another.')
        : message || (ar ? 'تعذر حفظ الملف الشخصي.' : 'Could not save your profile.'))
    } finally { setBusy(false) }
  }

  const signOut = () => { signOutCloud(); setSent(false); setCode(''); setStage('auth') }

  if (!hydrated || stage === 'loading' || stage === 'checking') {
    return <div className="flex min-h-dvh items-center justify-center bg-background p-6"><div className="flex items-center gap-3 text-muted-foreground"><BookOpen className="size-7 animate-pulse text-primary"/><span>{ar ? 'بنجهز Study…' : 'Preparing Study…'}</span></div></div>
  }

  if (stage === 'ready') return <><OfflineOutboxSync />{children}</>

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <section className="w-full max-w-md rounded-[2rem] border border-border bg-card p-6 shadow-panel sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><BookOpen className="size-8"/></span>
          <div><p className="text-xs font-semibold tracking-[0.18em] text-primary">STUDY</p><h1 className="text-2xl font-bold">{ar ? 'مجتمع المذاكرة' : 'Study Community'}</h1></div>
        </div>

        {stage === 'auth' ? <>
          <h2 className="text-xl font-bold">{sent ? (ar ? 'تأكيد البريد الإلكتروني' : 'Verify your email') : mode === 'signup' ? (ar ? 'إنشاء حساب جديد' : 'Create your account') : (ar ? 'أهلاً بعودتك' : 'Welcome back')}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{sent
            ? (ar ? `اكتب كود التحقق اللي وصل على ${email}` : `Enter the verification code sent to ${email}`)
            : (ar ? 'سجّل بالبريد الإلكتروني. بعد التحقق هنجهز ملفك الشخصي ونتأكد من عضويتك في المجتمع.' : 'Use your email to sign in or create an account. After verification, set up your profile and community access.')}</p>
          {!sent ? <>
            <div className="mt-5 grid grid-cols-2 rounded-xl bg-secondary/60 p-1">
              <button type="button" onClick={() => { setMode('login'); setError('') }} className={mode === 'login' ? 'rounded-lg bg-card px-3 py-2 text-sm font-semibold shadow-sm' : 'rounded-lg px-3 py-2 text-sm text-muted-foreground'}>{ar ? 'تسجيل دخول' : 'Sign in'}</button>
              <button type="button" onClick={() => { setMode('signup'); setError('') }} className={mode === 'signup' ? 'rounded-lg bg-card px-3 py-2 text-sm font-semibold shadow-sm' : 'rounded-lg px-3 py-2 text-sm text-muted-foreground'}>{ar ? 'إنشاء حساب' : 'Create account'}</button>
            </div>
            <form onSubmit={sendCode} className="mt-5 grid gap-3">
              <div className="grid gap-1.5"><Label htmlFor="study-auth-email">{ar ? 'البريد الإلكتروني' : 'Email address'}</Label><Input id="study-auth-email" type="email" autoComplete="email" dir="ltr" value={email} onChange={event => setEmail(event.target.value)} required placeholder="you@example.com"/></div>
              <Button type="submit" className="mt-1 w-full rounded-xl" disabled={busy || !email.trim()}><Mail data-icon="inline-start"/>{busy ? (ar ? 'جاري الإرسال…' : 'Sending…') : (ar ? 'إرسال كود التحقق' : 'Send verification code')}</Button>
            </form>
          </> : <form onSubmit={verifyCode} className="mt-5 grid gap-3">
            <div className="grid gap-1.5"><Label htmlFor="study-auth-code">{ar ? 'كود التحقق' : 'Verification code'}</Label><Input id="study-auth-code" inputMode="numeric" autoComplete="one-time-code" dir="ltr" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required minLength={6} maxLength={6} pattern="[0-9]{6}" placeholder="000000"/></div>
            <Button type="submit" className="w-full rounded-xl" disabled={busy || code.length !== 6}><KeyRound data-icon="inline-start"/>{busy ? (ar ? 'جاري التحقق…' : 'Verifying…') : (ar ? 'تأكيد البريد' : 'Verify email')}</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => { setSent(false); setCode(''); setError('') }}>{ar ? 'تغيير البريد' : 'Change email'}</Button>
          </form>}
        </> : null}

        {stage === 'profile' ? <>
          <h2 className="text-xl font-bold">{ar ? 'جهّز ملفك الشخصي' : 'Set up your profile'}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{ar ? 'دي البيانات اللي هتظهر لأعضاء المجتمع لما تنضم.' : 'These are the details other community members will see after you are approved.'}</p>
          <form onSubmit={saveProfile} className="mt-5 grid gap-3">
            <div className="grid gap-1.5"><Label htmlFor="study-display-name">{ar ? 'الاسم الظاهر' : 'Display name'}</Label><Input id="study-display-name" value={displayName} onChange={event => setDisplayName(event.target.value)} required minLength={2} maxLength={80}/></div>
            <div className="grid gap-1.5"><Label htmlFor="study-username">{ar ? 'اسم المستخدم (Username)' : 'Username'}</Label><Input id="study-username" dir="ltr" value={username} onChange={event => setUsername(event.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24))} required minLength={3} maxLength={24} placeholder="your_username"/></div>
            <div className="grid gap-1.5"><Label htmlFor="study-bio">{ar ? 'نبذة (اختياري)' : 'Bio (optional)'}</Label><Input id="study-bio" value={bio} onChange={event => setBio(event.target.value)} maxLength={160}/></div>
            <Button type="submit" className="mt-1 w-full rounded-xl" disabled={busy || displayName.trim().length < 2 || username.trim().length < 3}>{busy ? (ar ? 'جاري الحفظ…' : 'Saving…') : (ar ? 'حفظ ومتابعة' : 'Save and continue')}</Button>
          </form>
        </> : null}

        {stage === 'activation' ? <>
          <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-primary"><ShieldCheck className="size-6"/></div>
          <h2 className="text-xl font-bold">{ar ? 'حسابك اتجهّز — باقي اعتماد العضوية' : 'Account ready — membership approval pending'}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{ar ? 'تم التحقق من بريدك وحفظ ملفك الشخصي. التطبيق خاص بالأعضاء المعتمدين فقط؛ شاشة وأكواد التفعيل هتتربط لما نظام التفعيل يتنفذ. لحد وقتها لازم مسؤول المجتمع يضيف حسابك كعضو معتمد. مش هنفتح التطبيق أو المحادثات قبل الاعتماد.' : 'Your email is verified and profile is saved. Study is private; activation-code redemption will be connected when that system is implemented. Until then, an administrator must add your account as an approved member. The app and chats stay locked until approval.'}</p>
          <div className="mt-5 grid gap-2 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4"><Label htmlFor="study-activation-code">{ar ? 'كود التفعيل' : 'Activation code'}</Label><Input id="study-activation-code" disabled placeholder={ar ? 'هيتفعّل بعد تنفيذ نظام الأكواد' : 'Enabled when activation codes are implemented'} dir="ltr"/><Button type="button" disabled className="w-full">{ar ? 'تفعيل العضوية — قريبًا' : 'Activate membership — coming later'}</Button><p className="text-xs leading-5 text-muted-foreground">{ar ? 'مش هنقبل كود وهمي أو نتجاوز صلاحيات العضوية. حاليًا العضو المعتمد لازم يتضاف من مسؤول المجتمع.' : 'No fake code or membership bypass. For now, an administrator must approve members.'}</p></div>
        </> : null}

        {status ? <p role="status" className="mt-4 rounded-xl bg-primary/10 p-3 text-sm text-muted-foreground">{status}</p> : null}
        {error ? <p role="alert" className="mt-4 rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}

        {stage === 'activation' || stage === 'profile' ? <Button type="button" variant="outline" className="mt-4 w-full rounded-xl" onClick={signOut}><LogOut data-icon="inline-start"/>{ar ? 'تسجيل خروج' : 'Sign out'}</Button> : null}
        {stage === 'auth' && sent ? <p className="mt-4 text-center text-xs text-muted-foreground">{ar ? 'لو الرسالة ماوصلتش، راجع Spam وجرب بعد دقيقة.' : 'If the email does not arrive, check spam and try again in a minute.'}</p> : null}
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="size-3.5 text-primary"/>{ar ? 'بريدك وبياناتك محفوظة على حسابك' : 'Your account data is saved securely to your account'}</div>
      </section>
    </main>
  )
}
