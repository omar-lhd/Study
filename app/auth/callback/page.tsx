'use client'

import { useEffect, useState } from 'react'
import { BookOpen, CheckCircle2 } from 'lucide-react'

type CallbackState = 'checking' | 'success' | 'error'

export default function AuthCallbackPage() {
  const [state, setState] = useState<CallbackState>('checking')
  const [message, setMessage] = useState('')

  useEffect(() => {
    // Supabase email confirmation redirects tokens in the URL fragment.
    // Fragments are never sent to the server, so consume them client-side.
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const expiresIn = Number(params.get('expires_in') || 3600)
    const tokenType = params.get('token_type')
    const errorDescription = params.get('error_description')

    if (errorDescription) {
      setMessage(decodeURIComponent(errorDescription.replace(/\+/g, ' ')))
      setState('error')
      return
    }

    if (!accessToken || !refreshToken || tokenType?.toLowerCase() !== 'bearer') {
      setMessage('رابط التحقق غير صالح أو انتهت صلاحيته. ارجع للتطبيق واطلب كود جديد.')
      setState('error')
      return
    }

    try {
      const payloadPart = accessToken.split('.')[1]
      if (!payloadPart) throw new Error('Invalid access token')
      const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
      const payload = JSON.parse(atob(normalized)) as { sub?: string; email?: string }
      if (!payload.sub) throw new Error('Token does not contain a user id')

      const session = {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: Math.floor(Date.now() / 1000) + Math.max(60, expiresIn),
        user: { id: payload.sub, email: payload.email },
      }
      window.localStorage.setItem('psc:supabase-auth:v1', JSON.stringify(session))
      window.dispatchEvent(new Event('psc:supabase-auth-change'))
      // Remove bearer tokens from the address bar before navigating.
      window.history.replaceState(null, '', '/auth/callback')
      setState('success')
      setMessage('تم تأكيد البريد وتسجيل الدخول. بنفتح Study…')
      window.setTimeout(() => window.location.replace('/'), 650)
    } catch {
      setMessage('تعذر إكمال تسجيل الدخول من رابط البريد. ارجع للتطبيق واستخدم كود التحقق.')
      setState('error')
    }
  }, [])

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-7 text-center shadow-panel">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <BookOpen className="size-7" />
        </div>
        <h1 className="text-xl font-bold">تأكيد البريد الإلكتروني</h1>
        <p role={state === 'error' ? 'alert' : 'status'} className="mt-3 text-sm leading-6 text-muted-foreground">
          {state === 'checking' ? 'بنتحقق من رابط تسجيل الدخول…' : message}
        </p>
        {state === 'success' ? <CheckCircle2 className="mx-auto mt-4 size-5 text-primary" /> : null}
        {state === 'error' ? <a className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground" href="/">العودة إلى Study</a> : null}
      </section>
    </main>
  )
}
