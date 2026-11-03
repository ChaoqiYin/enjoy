import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { PluginsEmpty } from '../plugins/PluginsEmpty'

/** The plugins block on `/settings`: read-only, with no install affordance. */
export function PluginsSection(): ReactElement {
  const { t } = useTranslation()
  return (
    <section
      aria-labelledby="plugins-heading"
      className="rounded-lg border border-border bg-card p-4"
    >
      <h2 id="plugins-heading" className="text-sm font-medium">
        {t('plugins')}
      </h2>
      <PluginsEmpty className="mt-3 px-6 py-10" />
    </section>
  )
}
