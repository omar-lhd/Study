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
          'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[0.7rem] font-medium transition-colors',
          active ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        <span
          className={cn(
            'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
            active && 'bg-primary/15',
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
        'relative flex min-h-11 items-center justify-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors lg:justify-start',
        active
          ? 'bg-primary/12 text-primary'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
      )}
    >
      {active ? (
        <span aria-hidden="true" className="absolute inset-y-2 start-0 w-1 rounded-full bg-primary" />
      ) : null}
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <span className="sr-only lg:not-sr-only">{label}</span>
    </Link>
  )
}
