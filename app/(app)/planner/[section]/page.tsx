import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SectionPage } from '@/components/shared/section-page'
import { PLANNER_SECTIONS } from '@/config/sections'
import { getServerTranslator } from '@/lib/preferences/server'

type Props = { params: Promise<{ section: string }> }

export function generateStaticParams() {
  return PLANNER_SECTIONS.map(({ slug }) => ({ section: slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section } = await params
  const def = PLANNER_SECTIONS.find((item) => item.slug === section)
  const { t } = await getServerTranslator()
  return { title: def ? t(def.titleKey) : undefined }
}

export default async function PlannerSectionPage({ params }: Props) {
  const { section } = await params
  const def = PLANNER_SECTIONS.find((item) => item.slug === section)
  if (!def) notFound()

  return (
    <SectionPage
      section={def}
      parentHref="/planner"
      parentLabelKey="nav.planner"
      placeholderKey="planner.empty"
    />
  )
}
