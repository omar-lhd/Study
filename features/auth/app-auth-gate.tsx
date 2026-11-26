'use client'

import { useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { BookOpen, CheckCircle2, KeyRound, ShieldCheck, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import { usePreferences } from '@/components/providers/preferences-provider'
import { cloudRest, invokeAdminFunction, readCloudSession, signInWithPassword, signOutCloud, signUpWithPassword, subscribeCloudSession } from '@/lib/chats/cloud-client'
import { readOfflineSnapshot, writeOfflineSnapshot } from '@/lib/chats/offline-store'
import { OfflineOutboxSync } from './offline-outbox-sync'

type Stage = 'loading' | 'checking' | 'auth' | 'profile' | 'activation' | 'ready'
type Profile = { id: string; display_name: string; username: string | null; bio: string | null }
type Membership = { group_id: string; user_id: string }

function subscribeHydration() { return () => {} }
function getClientHydrated() { return true }
function getServerHydrated() { return false }

export function AppAuthGate({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(subscribeCloudSession, readCloudSession, () => null)
  const { locale } = usePreferences()
  const ar = locale === 'ar'
  const hydrated = useSyncExternalStore(subscribeHydration, getClientHydrated, getServerHydrated)
  const [stage, setStage] = useState<Stage>('loading')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const [activationCode, setActivationCode] = useState('')

  const pathname = usePathname()
  const userId = session?.user.id

  /* Auth/session and access checks synchronize React with the external Supabase session. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!hydrated) return
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStage('auth')
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError('')
      return
    }

    let active = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStage('checking')
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        const approved = memberships.length > 0
        if (!approved) {
          // Only an explicit visit to the isolated admin route performs the server-side check.
          if (pathname.startsWith('/admin/codes')) {
            try {
              await invokeAdminFunction({ action: 'check_access' })
              if (active) { setStage('ready'); return }
            } catch { /* non-admin stays on the activation gate */ }
          }
          void writeOfflineSnapshot('auth-access:' + userId, { approved: false, profileReady: false, checkedAt: Date.now() }).catch(() => {})
          setStage('activation')
          return
        }
        const profile = profiles[0]
        if (!profile || !profile.display_name?.trim() || profile.display_name === 'New member' || !profile.username?.trim()) {
          setDisplayName(profile?.display_name === 'New member' ? '' : profile?.display_name ?? '')
          setUsername(profile?.username ?? '')
          setBio(profile?.bio ?? '')
          setStage('profile')
          return
        }
        void writeOfflineSnapshot(`auth-access:${userId}`, { approved: true, profileReady: true, checkedAt: Date.now() }).catch(() => {})
        setStage('ready')
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
  }, [hydrated, userId, ar, retryCount, pathname])
  /* eslint-enable react-hooks/set-state-in-effect */

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setError(''); setStatus('')
    try {
      if (mode === 'signup') {
        const result = await signUpWithPassword(email, password)
        if (result.existingAccount) {
          setMode('login')
          setStatus(ar ? 'الحساب ده مسجل بالفعل. حولناك لتسجيل الدخول؛ استخدم نفس كلمة المرور.' : 'This email already has an account. Switched you to sign-in; use your existing password.')
          return
        }

      } else {
        try {
          await signInWithPassword(email, password)
        } catch (loginCause) {
          const loginMessage = loginCause instanceof Error ? loginCause.message : ''
          if (/invalid login credentials|invalid_credentials|user not found/i.test(loginMessage)) {
            setMode('signup')
            setStatus(ar
              ? 'تعذر تسجيل الدخول. لو دي أول مرة تستخدم البريد ده، جهزنا لك إنشاء حساب بنفس البيانات. ولو عندك حساب، ارجع لتسجيل الدخول وتأكد من كلمة المرور.'
              : 'Could not sign in. If this is your first time with this email, the signup form is ready with your details. If you already have an account, switch back and check your password.')
            return
          }
          throw loginCause
        }
      }
      setStatus(ar ? 'تم تسجيل الدخول. بنجهز حسابك…' : 'Signed in. Preparing your account…')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : ''
      if (/user already registered|already registered|email already exists/i.test(message)) {
        setMode('login')
        
        
        setStatus(ar ? 'الحساب ده مسجل بالفعل. حولناك لتسجيل الدخول؛ استخدم نفس كلمة المرور.' : 'This email already has an account. Switched you to sign-in; use your existing password.')
      } else if (/signups? not allowed|signup disabled|signups are disabled/i.test(message)) {
        setError(ar ? 'إنشاء الحسابات متوقف مؤقتًا. حاول مرة تانية لاحقًا.' : 'Account creation is temporarily unavailable. Please try again later.')
      } else if (/email not confirmed|email_not_confirmed|not confirmed/i.test(message)) {
        setError(ar ? 'البريد الإلكتروني محتاج تأكيد. افتح رسالة التأكيد ثم حاول تسجيل الدخول.' : 'Your email needs confirmation. Open the confirmation email, then try signing in.')
      } else if (/invalid login credentials/i.test(message)) {
        setError(ar ? 'البريد أو كلمة المرور غير صحيحين.' : 'Email or password is incorrect.')
      } else if (/rate|too many|429|over_request_rate_limit/i.test(message)) {
        setError(ar ? 'محاولات كتير في وقت قصير. استنى شوية وجرب تاني.' : 'Too many attempts in a short time. Please wait and try again.')
      } else {
        setError(ar ? 'تعذر إكمال العملية. راجع البيانات واتصل بالإنترنت ثم حاول مجددًا.' : 'Could not complete the request. Check your details and connection, then try again.')
      }
    } finally { setBusy(false) }
  }

  async function redeemActivationCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedCode = activationCode.trim().toUpperCase().replace(/\s+/g, '')
    if (normalizedCode.length < 8 || normalizedCode.length > 80) {
      setError(ar ? 'اكتب كود التفعيل كاملًا (من 8 إلى 80 حرفًا).' : 'Enter the complete activation code (8–80 characters).')
      return
    }
    if (!session) {
      setError(ar ? 'سجّل الدخول أولًا لتفعيل عضويتك.' : 'Sign in first to activate your membership.')
      return
    }

    setBusy(true)
    setError('')
    setStatus('')
    try {
      // The existing authenticated SECURITY DEFINER RPC performs the SHA-256
      // lookup, row lock, expiry/revocation checks and single-use membership
      // insert atomically. Never read plaintext codes from admin-only tables.
      await cloudRest<string>('rpc/redeem_invite', {
        method: 'POST',
        body: JSON.stringify({ p_code: normalizedCode }),
      })
      setActivationCode('')
      setStatus(ar ? 'تم تفعيل الكود بنجاح. بنراجع عضويتك دلوقتي…' : 'Code redeemed successfully. Verifying your membership…')
      setStage('checking')
      setRetryCount(value => value + 1)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : ''
      if (/already a group member/i.test(message)) {
        setStatus(ar ? 'عضويتك موجودة بالفعل. بنحدّث حالة الدخول…' : 'You are already a member. Refreshing access…')
        setStage('checking')
        setRetryCount(value => value + 1)
      } else if (/already used|redeemed/i.test(message)) {
        setError(ar ? 'الكود ده اتستخدم قبل كده. استخدم كود تفعيل جديد.' : 'This code has already been used. Use a new activation code.')
      } else if (/expired/i.test(message)) {
        setError(ar ? 'صلاحية الكود انتهت. اطلب كودًا جديدًا من مسؤول المجتمع.' : 'This code has expired. Ask a community administrator for a new one.')
      } else if (/revoked/i.test(message)) {
        setError(ar ? 'الكود ده اتلغى ومش ممكن تفعّله.' : 'This code has been revoked and cannot be activated.')
      } else if (/invalid invitation code|invalid.*code/i.test(message)) {
        setError(ar ? 'الكود غير صحيح. راجع الحروف والأرقام وحاول مرة تانية.' : 'That code is not valid. Check the letters and numbers, then try again.')
      } else if (/authentication required|invalid jwt|expired.*token|sign in/i.test(message)) {
        setError(ar ? 'جلسة تسجيل الدخول انتهت. سجّل الدخول مرة تانية.' : 'Your sign-in session expired. Please sign in again.')
      } else {
        setError(message || (ar ? 'تعذر تفعيل الكود. تحقق من الإنترنت وحاول مجددًا.' : 'Could not redeem the code. Check your connection and try again.'))
      }
    } finally {
      setBusy(false)
    }
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
      setStage('profile')
      const message = cause instanceof Error ? cause.message : ''
      setError(/unique|duplicate/i.test(message)
        ? (ar ? 'اسم المستخدم ده مستخدم بالفعل. اختار اسم تاني.' : 'That username is already taken. Choose another.')
        : (ar ? 'حصلت مشكلة مؤقتة في حفظ الملف الشخصي. حاول مرة تانية.' : 'A temporary issue prevented saving your profile. Please try again.'))
    } finally { setBusy(false) }
  }

  const signOut = () => { signOutCloud(); setPassword(''); setStage('auth') }

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
          <h2 className="text-xl font-bold">{mode === 'signup' ? (ar ? 'إنشاء حساب جديد' : 'Create your account') : (ar ? 'أهلاً بعودتك' : 'Welcome back')}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{ar ? 'اكتب البريد الإلكتروني وكلمة المرور. لو الحساب جديد هيتسجل ويدخل فورًا؛ ولو موجود سجّل دخول بكلمة مروره.' : 'Enter your email and password. New accounts should be created and signed in immediately; existing accounts sign in with their password.'}</p>
          <div className="mt-5 grid grid-cols-2 rounded-xl bg-secondary/60 p-1">
            <button type="button" onClick={() => { setMode('login'); setError(''); setStatus('') }} className={mode === 'login' ? 'rounded-lg bg-card px-3 py-2 text-sm font-semibold shadow-sm' : 'rounded-lg px-3 py-2 text-sm text-muted-foreground'}>{ar ? 'تسجيل دخول' : 'Sign in'}</button>
            <button type="button" onClick={() => { setMode('signup'); setError(''); setStatus('') }} className={mode === 'signup' ? 'rounded-lg bg-card px-3 py-2 text-sm font-semibold shadow-sm' : 'rounded-lg px-3 py-2 text-sm text-muted-foreground'}>{ar ? 'إنشاء حساب' : 'Create account'}</button>
          </div>
          <form onSubmit={submitAuth} className="mt-5 grid gap-3">
            <div className="grid gap-1.5"><Label htmlFor="study-auth-email">{ar ? 'البريد الإلكتروني' : 'Email address'}</Label><Input id="study-auth-email" type="email" autoComplete="email" dir="ltr" value={email} onChange={event => setEmail(event.target.value)} required placeholder="you@example.com"/></div>
            <div className="grid gap-1.5"><Label htmlFor="study-auth-password">{ar ? 'كلمة المرور' : 'Password'}</Label><Input id="study-auth-password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} dir="ltr" value={password} onChange={event => setPassword(event.target.value)} required minLength={8} maxLength={128} placeholder={ar ? '٨ أحرف على الأقل' : 'At least 8 characters'}/></div>
            <Button type="submit" className="mt-1 w-full rounded-xl" disabled={busy || !email.trim() || password.length < 8}><KeyRound data-icon="inline-start"/>{busy ? (ar ? 'جاري التحقق…' : 'Signing in…') : mode === 'signup' ? (ar ? 'إنشاء الحساب' : 'Create account') : (ar ? 'تسجيل الدخول' : 'Sign in')}</Button>
          </form>
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
          <h2 className="text-xl font-bold">{ar ? 'أهلًا بيك في Study' : 'Welcome to Study'}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{ar ? 'حسابك جاهز. أدخل كود التفعيل اللي اتولد من تطبيق Code Generator عشان تنضم للمجموعة وتفتح المجتمع والمحادثات.' : 'Your account is ready. Enter the activation code generated by Code Generator to join your study group and unlock the community and chats.'}</p>
          <form onSubmit={redeemActivationCode} className="mt-5 grid gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
            <div className="grid gap-1.5">
              <Label htmlFor="study-activation-code">{ar ? 'كود التفعيل' : 'Activation code'}</Label>
              <Input
                id="study-activation-code"
                value={activationCode}
                onChange={event => setActivationCode(event.target.value.toUpperCase())}
                placeholder={ar ? 'الصق كود التفعيل هنا' : 'Paste your activation code here'}
                dir="ltr"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={80}
                disabled={busy}
                className="h-12 text-center font-mono text-base font-semibold tracking-[0.12em]"
                aria-describedby="study-activation-help"
                required
              />
              <p id="study-activation-help" className="text-xs leading-5 text-muted-foreground">{ar ? 'الكود صالح للاستخدام مرة واحدة، وبيتم التحقق منه مباشرة وبشكل آمن.' : 'Codes are single-use and validated securely against the activation system.'}</p>
            </div>
            <Button type="submit" className="w-full rounded-xl" disabled={busy || activationCode.trim().length < 8}>
              <KeyRound data-icon="inline-start"/>
              {busy ? (ar ? 'جاري تفعيل العضوية…' : 'Activating membership…') : (ar ? 'تفعيل والانضمام' : 'Activate and join')}
            </Button>
          </form>
          <Button type="button" variant="outline" className="mt-3 w-full rounded-xl" onClick={() => { setError(''); setRetryCount(value => value + 1) }} disabled={busy}>
            {ar ? 'إعادة التحقق من العضوية' : 'Refresh membership status'}
          </Button>
        </> : null}

        {status ? <p role="status" className="mt-4 rounded-xl bg-primary/10 p-3 text-sm text-muted-foreground">{status}</p> : null}
        {error ? <p role="alert" className="mt-4 rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}

        {stage === 'activation' || stage === 'profile' ? <Button type="button" variant="outline" className="mt-4 w-full rounded-xl" onClick={signOut}><LogOut data-icon="inline-start"/>{ar ? 'تسجيل خروج' : 'Sign out'}</Button> : null}
        
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="size-3.5 text-primary"/>{ar ? 'بريدك وبياناتك محفوظة على حسابك' : 'Your account data is saved securely to your account'}</div>
      </section>
    </main>
  )
}
