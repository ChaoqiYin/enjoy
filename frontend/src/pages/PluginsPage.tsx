import { useTranslation } from 'react-i18next';
import { Puzzle } from 'lucide-react';
import { EmptyState } from '../features/library/EmptyState';
import { PageFrame } from '../features/library/PageFrame';
import { usePluginHost } from '../plugins/PluginHostProvider';
import { Badge } from '../shared/ui/badge';
import { ScrollViewport } from '../shared/ScrollViewport';
import { errorMessage } from '../shared/errorMessage';
import type { PluginStatus } from '../plugins/status';

/**
 * What is installed, what each plugin is doing, and why one of them is not.
 *
 * It draws the rows and nothing else: which plugins there are, which the user
 * switched off, and what a plugin says about itself are all facts it is handed,
 * so there is no state here and nothing to press. The plugin page is a page of
 * the window like any other — the navigation names it and marks it, which is
 * why it draws no heading of its own, exactly as the four listing pages and the
 * settings page stopped doing.
 *
 * The frame is the library's, so that a scan and a notice are drawn here the way
 * they are drawn everywhere else: those belong to the window rather than to the
 * page that happens to be on screen.
 */

/** The word for each state, and how loudly the badge says it. */
const STATES = {
  enabled: { word: 'pluginEnabled', variant: 'success' },
  disabled: { word: 'pluginDisabled', variant: 'secondary' },
  failed: { word: 'pluginFailed', variant: 'destructive' },
} as const;

export function PluginsPage() {
  const { t } = useTranslation();
  const { statuses } = usePluginHost();
  return (
    <PageFrame>
      <ScrollViewport className="min-h-0 space-y-4">
        {statuses.length === 0 ? (
          // Nothing installed is a state of the list rather than a failure to
          // draw it, and it says what a user would otherwise have to guess:
          // that installing a plugin is how this page stops being empty.
          <EmptyState
            icon={<Puzzle />}
            title={t('pluginsEmpty')}
            message={t('pluginsEmptyHint')}
          />
        ) : (
          <ul className="space-y-3">
            {statuses.map((status) => (
              <PluginRow key={status.id} status={status} />
            ))}
          </ul>
        )}
      </ScrollViewport>
    </PageFrame>
  );
}

/**
 * One plugin: what it is called, what it is doing or why it is not, and which
 * of the three states it is in.
 *
 * Both of the middle lines can be there at once, and both are drawn: a plugin
 * that said what it was doing and then failed is a row that has to say the
 * second thing without taking the first one back. The reason comes first,
 * because it is the one that needs an answer.
 *
 * A failure is drawn through the error protocol rather than as the sentence the
 * plugin threw: the code has words in both languages, and the plugin's own
 * message is text the interface cannot translate, cannot test, and cannot hold
 * to anything. Its identifier goes with it as the reference to look up.
 */
function PluginRow({ status }: { status: PluginStatus }) {
  const { t, i18n } = useTranslation();
  const { word, variant } = STATES[status.state];
  return (
    <li className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3">
      <div className="min-w-0 space-y-1">
        <p className="truncate font-medium">{status.name}</p>
        {status.failure && (
          <p className="text-sm text-muted-foreground">
            {errorMessage(
              { t, i18n },
              {
                code: status.failure.code,
                params: status.failure.params,
                errorId: status.id,
              },
            )}
          </p>
        )}
        {status.activity !== undefined && (
          // The plugin's own words, in the plugin's own language: they are
          // shown as they are, under a phrase that says whose they are.
          <p className="text-sm text-muted-foreground">
            {t('pluginDoing', { activity: status.activity })}
          </p>
        )}
      </div>
      <Badge variant={variant}>{t(word)}</Badge>
    </li>
  );
}
