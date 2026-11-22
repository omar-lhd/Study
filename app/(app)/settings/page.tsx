import type { Metadata } from 'next'
import { SectionLinks } from '@/components/shared/section-links'
import { PageHeader } from '@/components/ui/headers'
import { SETTINGS_SECTIONS } from '@/config/sections'
import { getServerTranslator } from '@/lib/preferences/server'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslator()
  return { title: t('nav.settings') }
}

export default async function SettingsPage() {
  const { t } = await getServerTranslator()
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('settings.title')} description={t('settings.description')} />
      <SectionLinks basePath="/settings" sections={SETTINGS_SECTIONS} showStatus />
    </div>
  )
}
