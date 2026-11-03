import { Plug } from 'lucide-react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../library/EmptyState'

/**
 * The read-only plugin signpost shared by the plugins route and the settings
 * page. The first version declares no UI plugins, so there is nothing to
 * install, enable or configure.
 */
export function PluginsEmpty({
  className,
}: {
  className?: string
}): ReactElement {
  const { t } = useTranslation()
  return (
    <EmptyState
      className={className}
      icon={<Plug className="size-7" />}
      title={t('pluginsEmpty')}
      message={t('pluginsEmptyHint')}
    />
  )
}
