import type { Metadata } from 'next'
import { SectionLinks } from '@/components/shared/section-links'
import { PageHeader } from '@/components/ui/headers'
import { COMMUNITY_SECTIONS } from '@/config/sections'
import { getServerTranslator } from '@/lib/preferences/server'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator()
  return { title: t('nav.community') }
}

export default async function CommunityPage() {
  const { t } = await getServerTranslator()
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('community.title')} description={t('community.description')} />
      <SectionLinks basePath="/community" sections={COMMUNITY_SECTIONS} />
    </div>
  )
}
