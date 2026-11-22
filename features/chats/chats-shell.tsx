import { MessageCircle, Search, SendHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/states'
import { getServerTranslator } from '@/lib/preferences/server'

/**
 * Two-panel messaging layout skeleton. No messaging behaviour exists yet:
 * the list is empty and the composer is disabled.
 */
export async function ChatsShell() {
  const { t } = await getServerTranslator()

  return (
    <div className="flex h-[calc(100dvh-14rem)] min-h-96 overflow-hidden rounded-xl border border-border bg-card shadow-panel md:h-[calc(100dvh-9rem)]">
      <section
        aria-label={t('chats.list.title')}
        className="flex w-full min-w-0 flex-col border-border md:w-80 md:shrink-0 md:border-e"
      >
        <div className="space-y-3 border-b border-border p-4">
          <h1 className="text-xl font-bold">{t('chats.title')}</h1>
          <div className="relative">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              disabled
              placeholder={t('chats.list.search')}
              aria-label={t('chats.list.search')}
              className="ps-9"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <EmptyState icon={<MessageCircle />} title={t('chats.list.empty')} description={t('chats.description')} />
        </div>
      </section>

      <section
        aria-label={t('chats.thread.title')}
        className="hidden min-w-0 flex-1 flex-col md:flex"
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <EmptyState
            icon={<MessageCircle />}
            title={t('chats.thread.title')}
            description={t('chats.thread.description')}
            action={<Badge variant="accent">{t('common.plannedIn')}</Badge>}
          />
        </div>
        <div className="flex items-center gap-2 border-t border-border p-3">
          <Input disabled placeholder={t('chats.composer.disabled')} aria-label={t('chats.composer.placeholder')} />
          <IconButton label={t('chats.composer.placeholder')} variant="primary" disabled>
            <SendHorizontal className="rtl:-scale-x-100" />
          </IconButton>
        </div>
      </section>
    </div>
  )
}
