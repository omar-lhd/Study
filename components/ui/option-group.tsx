'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Option<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  label: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  disabled?: boolean
}

export function OptionGroup<T extends string>({ label, value, options, onChange, disabled }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex min-h-12 items-center justify-between gap-3 rounded-lg border px-4 text-start text-sm font-medium transition-colors',
              selected
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border-strong bg-surface text-muted-foreground hover:text-foreground',
            )}
          >
            <span dir="auto">{option.label}</span>
            {selected ? <Check className="size-4 text-primary" aria-hidden="true" /> : null}
          </button>
        )
      })}
    </div>
  )
}
