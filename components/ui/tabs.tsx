'use client'

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { usePreferences } from '@/components/providers/preferences-provider'
import { cn } from '@/lib/utils'

export function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const { dir } = usePreferences()
  return <TabsPrimitive.Root dir={dir} className={className} {...props} />
}

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('scrollbar-thin flex gap-1 overflow-x-auto border-b border-border', className)}
      {...props}
    />
  )
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'relative min-h-11 shrink-0 px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:text-foreground',
        'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:opacity-0 data-[state=active]:after:opacity-100',
        className,
      )}
      {...props}
    />
  )
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('pt-5', className)} {...props} />
}
