import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const iconButtonVariants = cva(
  'inline-flex shrink-0 items-center justify-center rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5',
  {
    variants: {
      variant: {
        ghost: 'text-muted-foreground hover:bg-secondary hover:text-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
      },
      size: {
        sm: 'size-9',
        md: 'size-11',
      },
    },
    defaultVariants: { variant: 'ghost', size: 'md' },
  },
)

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {
  label: string
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, label, type = 'button', children, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    >
      {children}
    </button>
  ),
)
IconButton.displayName = 'IconButton'
