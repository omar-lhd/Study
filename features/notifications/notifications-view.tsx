import { Bell } from 'lucide-react'
import { SimpleTabs } from '@/components/shared/simple-tabs'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/headers'
import { EmptyState } from '@/components/ui/states'
import type { MessageKey } from '@/i18n/config'
import { getServerTranslator } from '@/lib/preferences/server'

const TYPES: MessageKey[] = [
  'notifications.type.privateMessages',
  'notifications.type.groupMessages',
  'notifications.type.studyRooms',
  'notifications.type.calls',
  'notifications.type.stories',
  'notifications.type.reminders',
  'notifications.type.achievements',
  'notifications.type.prayer',
]

export async function NotificationsView() {
  const { t } = await getServerTranslator()

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('notifications.title')} description={t('notifications.description')} />
      <SimpleTabs
        tabs={[
          {
            value: 'inbox',
            label: t('notifications.tab.inbox'),
            content: (
              <Card>
                <EmptyState icon={<Bell />} title={t('notifications.inbox.empty')} />
              </Card>
            ),
          },
          {
            value: 'preferences',
            label: t('notifications.tab.preferences'),
            content: (
              <Card padding="none" className="overflow-hidden">
                <p className="border-b border-border px-4 py-3 text-sm text-muted-foreground">
                  {t('notifications.preferences.note')}
                </p>
                <ul className="divide-y divide-border">
                  {TYPES.map((key) => (
                    <li key={key} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2">
                      <span className="text-sm font-medium">{t(key)}</span>
                      <Badge>{t('common.planned')}</Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            ),
          },
        ]}
      />
    </div>
  )
}
