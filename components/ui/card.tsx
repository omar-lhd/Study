import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const cardVariants = cva('rounded-xl border border-border', {
  variants: {
    variant: {
      card: 'bg-card shadow-panel',
      panel: 'bg-surface',
      flat: 'bg-transparent',
    },
    padding: {
      none: '',
      md: 'p-4 sm:p-5',
    },
  },
  defaultVariants: { variant: 'card', padding: 'md' },
})

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export function Card({ className, variant, padding, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant, padding }), className)} {...props} />
}
