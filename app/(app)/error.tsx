'use client'

import { TriangleAlert } from 'lucide-react'
import { useT } from '@/components/providers/preferences-provider'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/states'

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  const t = useT()

  return (
    <ErrorState
      icon={<TriangleAlert />}
      title={t('state.error.title')}
      description={t('state.error.description')}
      action={
        <Button variant="secondary" onClick={reset}>
          {t('common.retry')}
        </Button>
      }
    />
  )
}
