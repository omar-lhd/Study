'use client'

import { Toaster as Sonner } from 'sonner'
import { usePreferences } from '@/components/providers/preferences-provider'

export function Toaster() {
  const { theme, dir } = usePreferences()

  return (
    <Sonner
      theme={theme}
      dir={dir}
      position="top-center"
      toastOptions={{
        classNames: {
          toast: '!bg-elevated !text-foreground !border-border !shadow-float',
        },
      }}
    />
  )
}
