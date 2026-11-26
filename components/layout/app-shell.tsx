import type { ReactNode } from 'react'
import { ACCOUNT_NAV, PRIMARY_NAV } from '@/config/navigation'
import { getServerTranslator } from '@/lib/preferences/server'
import { Brand, BrandMark } from './brand'
import { NavLink } from './nav-link'

export async function AppShell({ children }: { children: ReactNode }) {
  const { t } = await getServerTranslator()

  return (
    <div className="study-ambient flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        {t('app.skipToContent')}
      </a>

      <aside className="glass-subtle sticky top-0 hidden h-dvh w-[4.75rem] shrink-0 flex-col gap-6 border-e px-3 py-5 md:flex lg:w-64 lg:px-4">
        <div className="hidden lg:block"><Brand /></div>
        <div className="flex justify-center lg:hidden"><BrandMark /></div>
        <nav aria-label={t('nav.primary')} className="flex flex-1 flex-col gap-1">
          {PRIMARY_NAV.map((item) => <NavLink key={item.href} href={item.href} variant="sidebar" />)}
        </nav>
        <nav aria-label={t('nav.account')} className="flex flex-col gap-1 border-t border-border/60 pt-4">
          {ACCOUNT_NAV.map((item) => <NavLink key={item.href} href={item.href} variant="sidebar" />)}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-navigation pt-safe sticky top-0 z-30 border-b md:hidden">
          <div className="flex h-14 items-center justify-between gap-2 px-4">
            <Brand showName={false} />
            <nav aria-label={t('nav.account')} className="flex items-center">
              {ACCOUNT_NAV.map((item) => <NavLink key={item.href} href={item.href} variant="topbar" />)}
            </nav>
          </div>
        </header>

        <main id="main" className="mx-auto flex w-full max-w-6xl flex-1 px-4 py-5 pb-28 md:px-8 md:py-8 md:pb-10">
          {children}
        </main>

        <nav aria-label={t('nav.primary')} className="glass-navigation pb-safe fixed inset-x-0 bottom-0 z-40 border-t md:hidden">
          <div className="flex items-stretch gap-1 px-2 pb-1.5 pt-1.5">
            {PRIMARY_NAV.map((item) => <NavLink key={item.href} href={item.href} variant="bottom" />)}
          </div>
        </nav>
      </div>
    </div>
  )
}
