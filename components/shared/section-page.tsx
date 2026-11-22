import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/headers'
import { EmptyState } from '@/components/ui/states'
import type { SectionDef } from '@/config/sections'
import type { MessageKey } from '@/i18n/config'
import { getServerTranslator } from '@/lib/preferences/server'

interface Props {
  section: SectionDef
  parentHref: string
  parentLabelKey: MessageKey
  placeholderKey: MessageKey
  children?: ReactNode
}

/** Route shell for a product area. Renders real content when passed, otherwise an honest placeholder. */
export async function SectionPage({ section, parentHref, parentLabelKey, placeholderKey, children }: Props) {
  const { t } = await getServerTranslator()
  const Icon = section.icon

  return (
    <div className="mx-auto max-w-3xl">
      <nav aria-label={t('nav.back')} className="pb-3">
        <Link
          href={parentHref}
          className="inline-flex min-h-9 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="size-4 rotate-180 rtl:rotate-0" aria-hidden="true" />
          {t(parentLabelKey)}
        </Link>
      </nav>
      <PageHeader
        title={t(section.titleKey)}
        description={t(section.descriptionKey)}
        actions={
          section.implemented ? null : <Badge variant="accent">{t('common.plannedIn')}</Badge>
        }
      />
      {children ?? (
        <Card>
          <EmptyState icon={<Icon />} title={t('state.empty.title')} description={t(placeholderKey)} />
        </Card>
      )}
    </div>
  )
}
