'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useT } from '@/components/providers/preferences-provider'
import { ACCOUNT_NAV, PRIMARY_NAV, isActivePath } from '@/config/navigation'
import { cn } from '@/lib/utils'

type Variant = 'sidebar' | 'bottom' | 'topbar'

export function NavLink({ href, variant }: { href: string; variant: Variant }) {
  const item = [...PRIMARY_NAV, ...ACCOUNT_NAV].find((entry) => entry.href === href)
  const pathname = usePathname()
  const t = useT()
  if (!item) return null
  const active = isActivePath(pathname, item.href)
  const Icon = item.icon
  const label = t(item.labelKey)

  if (variant === 'topbar') {
    return (
      <Link
        href={item.href}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'inline-flex size-11 items-center justify-center rounded-lg transition-colors hover:bg-secondary',
          active ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </Link>
    )
  }

  if (variant === 'bottom') {
    return (
      <Link
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[0.7rem] font-medium transition-all duration-300',
          active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <span
          className={cn(
            'flex h-8 w-12 items-center justify-center rounded-2xl border border-transparent transition-all duration-300',
            active && 'ambient-orb border-primary/20 text-primary-foreground shadow-[0_8px_26px_-18px_var(--primary)]',
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span className="max-w-full truncate">{label}</span>
      </Link>
    )
  }

  return (
    <Link
      href={item.href}
      title={label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex min-h-11 items-center justify-center gap-3 rounded-xl px-3 text-sm font-medium transition-all duration-300 lg:justify-start',
        active
          ? 'glass-standard text-primary shadow-[inset_0_1px_0_oklch(1_0_0_/_0.08)]'
          : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
      )}
    >
      {active ? (
        <span aria-hidden="true" className="absolute inset-y-2 start-0 w-1 rounded-full bg-gradient-to-b from-primary to-accent shadow-[0_0_14px_var(--primary)]" />
      ) : null}
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <span className="sr-only lg:not-sr-only">{label}</span>
    </Link>
  )
}
