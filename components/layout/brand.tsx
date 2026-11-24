import Link from 'next/link'
import { getServerTranslator } from '@/lib/preferences/server'
import { cn } from '@/lib/utils'

/** Study's learning-circle mark: an open book joined by a small orbit of ideas. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-panel',
        className,
      )}
    >
      <svg viewBox="0 0 32 32" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5.5 8.5c4.1-.9 7.2.2 10.5 2.4v14c-3.3-2.2-6.4-3.3-10.5-2.4V8.5Z" />
        <path d="M26.5 8.5c-4.1-.9-7.2.2-10.5 2.4v14c3.3-2.2 6.4-3.3 10.5-2.4V8.5Z" />
        <path d="M10 13c1.7.1 3.1.6 4.5 1.5M10 17c1.7.1 3.1.6 4.5 1.5M22 13c-1.7.1-3.1.6-4.5 1.5M22 17c-1.7.1-3.1.6-4.5 1.5" opacity=".55" />
        <path d="M24.8 3.5v4.2M22.7 5.6h4.2" strokeWidth="2.1" />
      </svg>
    </span>
  )
}

export async function Brand({ showName = true }: { showName?: boolean }) {
  const { t } = await getServerTranslator()
  return (
    <Link href="/" className="flex min-w-0 items-center gap-3" aria-label={t('app.name')}>
      <BrandMark />
      {showName ? (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-bold">{t('app.name')}</span>
          <span className="block text-[0.7rem] text-muted-foreground">{t('app.workingName')}</span>
        </span>
      ) : null}
    </Link>
  )
}
