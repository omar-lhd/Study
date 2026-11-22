import Link from 'next/link'
import { getServerTranslator } from '@/lib/preferences/server'
import { cn } from '@/lib/utils'

/** Neutral placeholder mark. The product name is a working name; final branding is undecided. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M5 6.5C5 5.7 5.7 5 6.5 5H11v14H6.5C5.7 19 5 18.3 5 17.5v-11Z" />
        <path d="M19 6.5c0-.8-.7-1.5-1.5-1.5H13v14h4.5c.8 0 1.5-.7 1.5-1.5v-11Z" />
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
