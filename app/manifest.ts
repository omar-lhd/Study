import type { MetadataRoute } from 'next'
import { createTranslator } from '@/i18n/config'
import { getLocale } from '@/lib/preferences/server'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = createTranslator(await getLocale())
  return {
    name: t('app.name'),
    short_name: t('app.nameShort'),
    start_url: '/',
    display: 'standalone',
    background_color: '#171626',
    theme_color: '#171626',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  }
}
