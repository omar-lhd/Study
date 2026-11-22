import { notFound } from 'next/navigation'
import { SectionPage } from '@/components/shared/section-page'
import { PROFILE_SECTIONS } from '@/config/sections'

type Props = { params: Promise<{ section: string }> }

export function generateStaticParams() {
  return PROFILE_SECTIONS.map(({ slug }) => ({ section: slug }))
}

export default async function ProfileSectionPage({ params }: Props) {
  const { section } = await params
  const def = PROFILE_SECTIONS.find((item) => item.slug === section)
  if (!def) notFound()

  return (
    <SectionPage
      section={def}
      parentHref="/profile"
      parentLabelKey="nav.profile"
      placeholderKey="settings.planned"
    />
  )
}
