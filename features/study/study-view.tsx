import { BookOpenCheck, History, Timer, Users, DoorOpen } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/headers'
import { EmptyState } from '@/components/ui/states'
import { getServerTranslator } from '@/lib/preferences/server'
import { SimpleTabs } from '@/components/shared/simple-tabs'

export async function StudyView() {
  const { t } = await getServerTranslator()

  const tabs = [
    { value: 'current', label: t('study.tab.current'), icon: <Timer />, text: t('study.current.empty') },
    { value: 'upcoming', label: t('study.tab.upcoming'), icon: <Users />, text: t('study.upcoming.empty') },
    { value: 'rooms', label: t('study.tab.rooms'), icon: <DoorOpen />, text: t('study.rooms.empty') },
    { value: 'history', label: t('study.tab.history'), icon: <History />, text: t('study.history.empty') },
  ]

  return (
    <div>
      <PageHeader
        title={t('study.title')}
        description={t('study.description')}
        actions={
          <Button disabled>
            <BookOpenCheck aria-hidden="true" />
            {t('study.start')}
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <SimpleTabs
          tabs={tabs.map((tab) => ({
            value: tab.value,
            label: tab.label,
            content: (
              <Card>
                <EmptyState icon={tab.icon} title={tab.text} />
              </Card>
            ),
          }))}
        />
        <Card variant="panel" className="h-fit">
          <EmptyState
            icon={<Users />}
            title={t('study.workspace.title')}
            description={t('study.workspace.description')}
            action={<Badge variant="accent">{t('common.plannedIn')}</Badge>}
          />
        </Card>
      </div>
    </div>
  )
}
