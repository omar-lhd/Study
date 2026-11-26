import Link from 'next/link'
import {
  Activity,
  Bell,
  CalendarCheck,
  ChevronRight,
  HandHelping,
  ListChecks,
  Target,
  Timer,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { SectionHeader } from '@/components/ui/headers'
import { APP_TIME_ZONE } from '@/config/app'
import { LOCALE_META, type MessageKey } from '@/i18n/config'
import { getServerTranslator } from '@/lib/preferences/server'
import { ActiveSessionCount } from './active-session-count'

const QUICK_ACTIONS: { href: string; icon: LucideIcon; labelKey: MessageKey }[] = [
  { href: '/study', icon: Timer, labelKey: 'home.quickStart.solo' },
  { href: '/study', icon: Users, labelKey: 'home.quickStart.group' },
  { href: '/planner/tasks', icon: CalendarCheck, labelKey: 'home.quickStart.task' },
  { href: '/community/help', icon: HandHelping, labelKey: 'home.quickStart.help' },
]

function EmptyLine({ icon: Icon, children }: { icon: LucideIcon; children: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed border-border-strong px-4 py-4">
      <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm text-muted-foreground text-pretty">{children}</p>
    </div>
  )
}

function Block({
  title,
  icon,
  emptyText,
  className,
}: {
  title: string
  icon: LucideIcon
  emptyText: string
  className?: string
}) {
  return (
    <section className={className}>
      <SectionHeader title={title} />
      <EmptyLine icon={icon}>{emptyText}</EmptyLine>
    </section>
  )
}

export async function TodayView() {
  const { locale, t } = await getServerTranslator()
  const now = new Date()
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: APP_TIME_ZONE }).format(now),
  )
  const greetingKey: MessageKey =
    hour < 12 ? 'home.greeting.morning' : hour < 18 ? 'home.greeting.afternoon' : 'home.greeting.evening'
  const date = new Intl.DateTimeFormat(LOCALE_META[locale].intl, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: APP_TIME_ZONE,
  }).format(now)

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-sm font-medium text-primary">{date}</p>
        <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{t(greetingKey)}</h1>
        <p className="max-w-prose text-sm text-muted-foreground text-pretty sm:text-base">{t('home.subtitle')}</p>
      </header>

      <section aria-labelledby="quick-start">
        <h2 id="quick-start" className="sr-only">
          {t('home.quickStart.title')}
        </h2>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {QUICK_ACTIONS.map(({ href, icon: Icon, labelKey }) => (
            <li key={labelKey}>
              <Link
                href={href}
                className="flex min-h-20 h-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium transition-colors hover:border-primary/60 hover:bg-secondary/50"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 text-pretty">{t(labelKey)}</span>
                <ChevronRight
                  className="hidden size-4 shrink-0 text-muted-foreground sm:block rtl:-scale-x-100"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="space-y-6">
          <Block title={t('home.progress.title')} icon={Activity} emptyText={t('home.progress.empty')} />
          <Block
            title={t('home.tasks.title')}
            icon={ListChecks}
            emptyText={t('home.tasks.empty')}
            className="border-t border-border pt-6"
          />
          <section className="space-y-3 border-t border-border pt-6">
            <SectionHeader title={t('home.sessions.title')} />
            <ActiveSessionCount />
          </section>
        </Card>

        <div className="space-y-6">
          <Card variant="panel">
            <Block title={t('home.activity.title')} icon={Users} emptyText={t('home.activity.empty')} />
          </Card>
          <Card variant="panel">
            <Block title={t('home.notifications.title')} icon={Bell} emptyText={t('home.notifications.empty')} />
          </Card>
          <Card variant="panel">
            <Block title={t('home.goals.title')} icon={Target} emptyText={t('home.goals.empty')} />
          </Card>
        </div>
      </div>
    </div>
  )
}
