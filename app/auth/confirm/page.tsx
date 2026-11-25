'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BookOpen, LoaderCircle } from 'lucide-react'
import { completeEmailConfirmationFromUrl } from '@/lib/chats/cloud-client'

export default function EmailConfirmationPage() {
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void completeEmailConfirmationFromUrl()
      .then(() => {
        if (active) window.location.replace('/')
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'تعذر تأكيد البريد.')
      })
    return () => { active = false }
  }, [])

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <section className="w-full max-w-md rounded-[2rem] border border-border bg-card p-8 text-center shadow-panel">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <BookOpen className="size-8" />
        </div>
        <h1 className="text-2xl font-bold">تأكيد البريد الإلكتروني</h1>
        {error ? (
          <>
            <p role="alert" className="mt-4 rounded-xl bg-danger/10 p-4 text-sm leading-6 text-danger">{error}</p>
            <Link href="/" className="mt-5 inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground">العودة لتسجيل الدخول</Link>
          </>
        ) : (
          <p role="status" className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            جاري تأكيد بريدك وتسجيل دخولك…
          </p>
        )}
      </section>
    </main>
  )
}
