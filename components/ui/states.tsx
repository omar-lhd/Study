import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

function StateLayout({ icon, title, description, action, className, tone }: StateProps & { tone?: 'danger' }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-4 py-10 text-center', className)}>
      {icon ? (
        <span
          aria-hidden="true"
          className={cn(
            'flex size-12 items-center justify-center rounded-full [&_svg]:size-6',
            tone === 'danger' ? 'bg-danger/15 text-danger' : 'bg-secondary text-muted-foreground',
          )}
        >
          {icon}
        </span>
      ) : null}
      <div className="max-w-sm space-y-1">
        <p className="font-semibold text-balance">{title}</p>
        {description ? <p className="text-sm text-muted-foreground text-pretty">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function EmptyState(props: StateProps) {
  return <StateLayout {...props} />
}

export function ErrorState(props: StateProps) {
  return <StateLayout {...props} tone="danger" />
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-secondary', className)} />
}

export function LoadingState({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn('space-y-3 p-4', className)}>
      <span className="sr-only">{label}</span>
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}
