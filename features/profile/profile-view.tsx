import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/headers'
import { SectionLinks } from '@/components/shared/section-links'
import { PROFILE_SECTIONS } from '@/config/sections'
import { getServerTranslator } from '@/lib/preferences/server'

export async function ProfileView() {
  const { t } = await getServerTranslator()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t('profile.title')} description={t('profile.description')} />
      <Card className="flex items-center gap-4">
        <Avatar name={t('profile.guest')} size="lg" />
        <div className="min-w-0 space-y-1">
          <p className="text-lg font-semibold">{t('profile.guest')}</p>
          <p className="text-sm text-muted-foreground">{t('profile.guestHint')}</p>
        </div>
        <Badge variant="accent" className="ms-auto">
          {t('common.planned')}
        </Badge>
      </Card>
      <SectionLinks basePath="/profile" sections={PROFILE_SECTIONS} />
    </div>
  )
}
