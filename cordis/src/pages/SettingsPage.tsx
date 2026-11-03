import { Settings } from 'lucide-react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../features/library/EmptyState'

/** Placeholder: the scan and settings work lives in a later task. */
export function SettingsPage(): ReactElement {
  const { t } = useTranslation()
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-6">
      <h1 className="text-xl font-semibold">{t('settings')}</h1>
      <EmptyState
        icon={<Settings className="size-7" />}
        title={t('settings')}
        message={t('settingsPlaceholder')}
      />
    </section>
  )
}
