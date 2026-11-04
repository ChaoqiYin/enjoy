import { useEffect, useState, type ReactElement } from 'react'
import { Puzzle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PluginSummary } from '../shared/api'
import { useServices } from '../shared/services'
import { ScrollViewport } from '../shared/ScrollViewport'
import { PageFrame } from '../features/layout/PageFrame'
import { EmptyState } from '../features/library/EmptyState'

/**
 * The read-only plugin route, arranged the way the old page arranged it: a
 * scroll area under the header, holding either the installed plugins or the
 * empty state that says there are none.
 *
 * The old page had a toolbar above the scroll area with install and safe-mode
 * commands; neither has a backend in this build, so the row is gone rather than
 * drawn disabled. What remains is the scroll area and the empty state, which is
 * the page's whole content while nothing can be installed.
 *
 * The list comes from the server rather than from a constant here, so the page
 * keeps telling the truth once a later version can report an installed plugin.
 * Like the listing pages it draws no heading: the header's navigation already
 * names this route, and the empty state carries the words the page needs.
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
    <PageFrame>
      <ScrollViewport className="min-h-0 flex-1 space-y-4">
        {plugins === null ? null : plugins.length === 0 ? (
          <EmptyState
            icon={<Puzzle />}
            title={t('pluginsEmpty')}
            message={t('pluginsEmptyHint')}
          />
        ) : (
          <ul className="space-y-3">
            {plugins.map((plugin) => (
              <li
                key={plugin.id}
                data-testid={`plugin-${plugin.id}`}
                className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3"
              >
                <span className="truncate font-medium">{plugin.name}</span>
                {plugin.version !== undefined && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {plugin.version}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </ScrollViewport>
    </PageFrame>
  )
}
