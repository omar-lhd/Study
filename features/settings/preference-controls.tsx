'use client'

import { usePreferences } from '@/components/providers/preferences-provider'
import { Card } from '@/components/ui/card'
import { OptionGroup } from '@/components/ui/option-group'
import { LOCALES, type Locale } from '@/i18n/config'
import { THEMES, type Theme } from '@/lib/preferences/config'

export function LanguageSettings() {
  const { locale, setLocale, pending, t } = usePreferences()

  return (
    <Card className="space-y-4">
      <OptionGroup<Locale>
        label={t('settings.language')}
        value={locale}
        onChange={setLocale}
        disabled={pending}
        options={LOCALES.map((value) => ({ value, label: t(`lang.${value}`) }))}
      />
      <p className="text-sm text-muted-foreground">{t('settings.language.persisted')}</p>
    </Card>
  )
}

export function AppearanceSettings() {
  const { theme, setTheme, t } = usePreferences()

  return (
    <Card className="space-y-4">
      <OptionGroup<Theme>
        label={t('settings.appearance')}
        value={theme}
        onChange={setTheme}
        options={THEMES.map((value) => ({ value, label: t(`theme.${value}`) }))}
      />
      <p className="text-sm text-muted-foreground">{t('settings.appearance.persisted')}</p>
    </Card>
  )
}
