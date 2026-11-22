import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Sans_Arabic, Inter } from 'next/font/google'
import { PreferencesProvider } from '@/components/providers/preferences-provider'
import { Toaster } from '@/components/ui/toaster'
import { LOCALE_META, createTranslator } from '@/i18n/config'
import { getLocale, getTheme } from '@/lib/preferences/server'
import './globals.css'

const latin = Inter({
  subsets: ['latin'],
  variable: '--font-latin',
  display: 'swap',
})

const arabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'swap',
})

export async function generateMetadata(): Promise<Metadata> {
  const t = createTranslator(await getLocale())
  return {
    title: { default: t('app.name'), template: `%s | ${t('app.name')}` },
    description: t('home.subtitle'),
    applicationName: t('app.name'),
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0e1517' },
    { media: '(prefers-color-scheme: light)', color: '#f7f5ef' },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, theme] = await Promise.all([getLocale(), getTheme()])
  const { dir } = LOCALE_META[locale]

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${latin.variable} ${arabic.variable} ${theme === 'light' ? 'light' : ''}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh antialiased">
        <PreferencesProvider locale={locale} theme={theme}>
          {children}
          <Toaster />
        </PreferencesProvider>
      </body>
    </html>
  )
}
