import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const avatarVariants = cva(
  'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 font-semibold text-primary',
  {
    variants: {
      size: {
        sm: 'size-8 text-xs',
        md: 'size-10 text-sm',
        lg: 'size-16 text-xl',
        xl: 'size-24 text-3xl',
      },
    },
    defaultVariants: { size: 'md' },
  },
)

interface AvatarProps extends VariantProps<typeof avatarVariants> {
  name: string
  src?: string
  className?: string
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts
    .slice(0, 2)
    .map((part) => Array.from(part)[0] ?? '')
    .join('')
}

export function Avatar({ name, src, size, className }: AvatarProps) {
  return (
    <span className={cn(avatarVariants({ size }), className)} role="img" aria-label={name}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <span aria-hidden="true" dir="auto">
          {initials(name)}
        </span>
      )}
    </span>
  )
}
