import { useEffect, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { PluginSummary } from '../shared/api'
import { useServices } from '../shared/services'
import { PluginsEmpty } from '../features/plugins/PluginsEmpty'

/**
 * The read-only plugin route.
 *
 * The list comes from the server rather than from a constant here, so the page
 * keeps telling the truth once a later version can report an installed plugin.
 */
export function PluginsPage(): ReactElement {
  const { t } = useTranslation()
  const { api } = useServices()
  const [plugins, setPlugins] = useState<PluginSummary[] | null>(null)

  useEffect(() => {
    let alive = true
    void api
      .listPlugins()
      .then((found) => {
        if (alive) setPlugins(found)
      })
      .catch(() => {
        // A failed read is drawn as the empty state; retrying is a reload.
        if (alive) setPlugins([])
      })
    return () => {
      alive = false
    }
  }, [api])

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-6">
      <h1 className="text-xl font-semibold">{t('plugins')}</h1>
      {plugins === null ? null : plugins.length === 0 ? (
        <PluginsEmpty />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {plugins.map((plugin) => (
            <li
              key={plugin.id}
              data-testid={`plugin-${plugin.id}`}
              className="flex items-baseline justify-between gap-3 px-4 py-3"
            >
              <span className="text-sm font-medium">{plugin.name}</span>
              {plugin.version !== undefined && (
                <span className="text-xs text-muted-foreground">
                  {plugin.version}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
