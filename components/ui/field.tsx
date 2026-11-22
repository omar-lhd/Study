import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const controlBase =
  'w-full rounded-lg border border-border-strong bg-surface px-3 text-base text-foreground placeholder:text-muted-foreground transition-colors focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm'

/** dir="auto" lets user-entered mixed Arabic/English text align naturally. */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, dir = 'auto', ...props }, ref) => (
    <input ref={ref} dir={dir} className={cn(controlBase, 'h-11', className)} {...props} />
  ),
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, dir = 'auto', ...props }, ref) => (
  <textarea ref={ref} dir={dir} className={cn(controlBase, 'min-h-24 py-2', className)} {...props} />
))
Textarea.displayName = 'Textarea'

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select ref={ref} className={cn(controlBase, 'h-11 appearance-none pe-9', className)} {...props}>
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  ),
)
Select.displayName = 'Select'

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-sm font-medium', className)} {...props} />
}
