import { LoadingState } from '@/components/ui/states'
import { getServerTranslator } from '@/lib/preferences/server'

export default async function Loading() {
  const { t } = await getServerTranslator()
  return <LoadingState label={t('common.loading')} />
}
