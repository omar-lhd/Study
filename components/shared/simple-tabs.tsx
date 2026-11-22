'use client'

import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export interface TabItem {
  value: string
  label: string
  content: ReactNode
}

export function SimpleTabs({ tabs, className }: { tabs: TabItem[]; className?: string }) {
  const first = tabs[0]
  if (!first) return null

  return (
    <Tabs defaultValue={first.value} className={className}>
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}
