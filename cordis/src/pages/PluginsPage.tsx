import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { PluginsEmpty } from '../features/plugins/PluginsEmpty'

/** The first version declares no UI plugins, so this route is only a signpost. */
export function PluginsPage(): ReactElement {
  const { t } = useTranslation()
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-6">
      <h1 className="text-xl font-semibold">{t('plugins')}</h1>
      <PluginsEmpty />
    </section>
  )
}
