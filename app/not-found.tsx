import Link from 'next/link'
import { Compass } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'
import { getServerTranslator } from '@/lib/preferences/server'

export default async function NotFound() {
  const { t } = await getServerTranslator()

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <EmptyState
        icon={<Compass />}
        title={t('state.notFound.title')}
        description={t('state.notFound.description')}
        action={
          <Link href="/" className={buttonVariants()}>
            {t('state.notFound.cta')}
          </Link>
        }
      />
    </main>
  )
}
