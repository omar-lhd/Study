import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SectionPage } from '@/components/shared/section-page'
import { SETTINGS_SECTIONS } from '@/config/sections'
import { AppearanceSettings, LanguageSettings } from '@/features/settings/preference-controls'
import { getServerTranslator } from '@/lib/preferences/server'

type Props = { params: Promise<{ section: string }> }

export function generateStaticParams() {
  return SETTINGS_SECTIONS.map(({ slug }) => ({ section: slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section } = await params
  const def = SETTINGS_SECTIONS.find((item) => item.slug === section)
  const { t } = await getServerTranslator()
  return { title: def ? t(def.titleKey) : undefined }
}

export default async function SettingsSectionPage({ params }: Props) {
  const { section } = await params
  const def = SETTINGS_SECTIONS.find((item) => item.slug === section)
  if (!def) notFound()

  return (
    <SectionPage
      section={def}
      parentHref="/settings"
      parentLabelKey="nav.settings"
      placeholderKey="settings.planned"
    >
      {section === 'language' ? <LanguageSettings /> : section === 'appearance' ? <AppearanceSettings /> : undefined}
    </SectionPage>
  )
}
