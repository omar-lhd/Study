import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { SectionDef } from '@/config/sections'
import { getServerTranslator } from '@/lib/preferences/server'

interface Props {
  basePath: string
  sections: SectionDef[]
  showStatus?: boolean
}

export async function SectionLinks({ basePath, sections, showStatus }: Props) {
  const { t } = await getServerTranslator()

  return (
    <Card padding="none" className="overflow-hidden">
      <ul className="divide-y divide-border">
        {sections.map(({ slug, icon: Icon, titleKey, descriptionKey, implemented }) => (
          <li key={slug}>
            <Link
              href={`${basePath}/${slug}`}
              className="flex min-h-16 items-center gap-4 px-4 py-3 transition-colors hover:bg-secondary/60"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t(titleKey)}</span>
                <span className="block truncate text-sm text-muted-foreground">{t(descriptionKey)}</span>
              </span>
              {showStatus ? (
                <Badge variant={implemented ? 'success' : 'neutral'} className="hidden sm:inline-flex">
                  {implemented ? t('settings.status.implemented') : t('settings.status.planned')}
                </Badge>
              ) : null}
              <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
