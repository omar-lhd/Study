import type { Metadata } from 'next'
import { SectionLinks } from '@/components/shared/section-links'
import { PageHeader } from '@/components/ui/headers'
import { PLANNER_SECTIONS } from '@/config/sections'
import { getServerTranslator } from '@/lib/preferences/server'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator()
  return { title: t('nav.planner') }
}

export default async function PlannerPage() {
  const { t } = await getServerTranslator()
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('planner.title')} description={t('planner.description')} />
      <SectionLinks basePath="/planner" sections={PLANNER_SECTIONS} />
    </div>
  )
}
