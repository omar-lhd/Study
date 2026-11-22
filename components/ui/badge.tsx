import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral: 'bg-secondary text-secondary-foreground',
        primary: 'bg-primary/15 text-primary',
        accent: 'bg-accent/20 text-foreground',
        success: 'bg-success/15 text-success',
        warning: 'bg-warning/15 text-warning',
        danger: 'bg-danger/15 text-danger',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

const dotVariants = cva('inline-block size-2.5 rounded-full', {
  variants: {
    status: {
      online: 'bg-success',
      busy: 'bg-danger',
      away: 'bg-warning',
      offline: 'bg-border-strong',
    },
  },
  defaultVariants: { status: 'offline' },
})

export function StatusDot({
  status,
  label,
  className,
}: VariantProps<typeof dotVariants> & { label: string; className?: string }) {
  return (
    <span role="img" aria-label={label} className={cn(dotVariants({ status }), className)} />
  )
}
