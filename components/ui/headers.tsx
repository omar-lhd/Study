import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface HeaderProps {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, description, actions, className }: HeaderProps) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-3 pb-5', className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{title}</h1>
        {description ? (
          <p className="max-w-prose text-sm text-muted-foreground text-pretty sm:text-base">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function SectionHeader({ title, description, actions, className }: HeaderProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3 pb-3', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions}
    </div>
  )
}
