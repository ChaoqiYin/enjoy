import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Puzzle, ShieldCheck, Trash2 } from 'lucide-react';
import { EmptyState } from '../features/library/EmptyState';
import { PageFrame } from '../features/library/PageFrame';
import { useNotices } from '../features/library/useNotices';
import { PluginInstallDialog } from '../plugins/PluginInstallDialog';
import { usePluginHost } from '../plugins/PluginHostProvider';
import { PluginSafeModeDialog } from '../plugins/PluginSafeModeDialog';
import { PluginUninstallDialog } from '../plugins/PluginUninstallDialog';
import { useCommand } from '../shared/useCommand';
import { Badge } from '../shared/ui/badge';
import { Button } from '../shared/ui/button';
import { Checkbox } from '../shared/ui/checkbox';
import { Tooltip } from '../shared/Tooltip';
import { ScrollViewport } from '../shared/ScrollViewport';
import { errorMessage } from '../shared/errorMessage';
import type { PluginBootstrap, PluginStatus } from '../plugins/status';

/**
 * What is installed, what each plugin is doing, why one of them is not, and
 * what the user may do about it.
 *
 * The rows themselves are handed to it — which plugins there are, which the
 * user switched off, and what a plugin says about itself are all facts the host
 * holds — and what this page owns is the four things a user does to them:
 * install, switch one on or off, uninstall, and put the whole lot aside. The
 * plugin page is a page of the window like any other — the navigation names it
 * and marks it, which is why it draws no heading of its own.
 *
 * **Everything here takes effect on the next start.** The kernel does not
 * hot-plug (spec #82 「不做热插拔」), so a lifecycle command answers with the
 * state of the disk and this page says so rather than pretending the window has
 * changed underneath it. That is what the line under the toolbar is for, and it
 * appears the first time the user changes anything.
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
  const { statuses, refresh } = usePluginHost();
  const [installing, setInstalling] = useState(false);
  const [removing, setRemoving] = useState<PluginStatus | null>(null);
  const [safeMode, setSafeMode] = useState(false);
  const [changed, setChanged] = useState(false);

  // Every lifecycle command answers with the list as it now stands, so the page
  // redraws from that answer rather than from a second question — and it is
  // redrawn without loading anything, because what it is now showing is what the
  // next start will do rather than what this window is running.
  const applied = useCallback(
    (plugins: readonly PluginBootstrap[]) => {
      refresh(plugins);
      setChanged(true);
    },
    [refresh],
  );

  return (
    <PageFrame>
      <div className="flex flex-wrap items-center gap-3">
        {changed && (
          <p className="text-sm text-muted-foreground">
            {t('pluginsRestartHint')}
          </p>
        )}
        <div className="ml-auto flex items-center gap-3">
          {/* Quiet, and deliberately: safe mode is what a user reaches for when
              the window will not come up, not a thing to press while browsing.
              It is not `destructive` either — nothing is removed. */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSafeMode(true)}
          >
            <ShieldCheck size={14} aria-hidden="true" />
            {t('pluginSafeMode')}
          </Button>
          <Button size="sm" onClick={() => setInstalling(true)}>
            <Plus size={14} aria-hidden="true" />
            {t('pluginInstall')}
          </Button>
        </div>
      </div>
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
              <PluginRow
                key={status.id}
                status={status}
                onChanged={applied}
                onRemove={() => setRemoving(status)}
              />
            ))}
          </ul>
        )}
      </ScrollViewport>
      {installing && (
        <PluginInstallDialog
          onClose={() => setInstalling(false)}
          onInstalled={applied}
        />
      )}
      {removing && (
        <PluginUninstallDialog
          status={removing}
          onClose={() => setRemoving(null)}
          onRemoved={applied}
        />
      )}
      {safeMode && (
        <PluginSafeModeDialog
          onClose={() => setSafeMode(false)}
          onEntered={applied}
        />
      )}
    </PageFrame>
  );
}

/**
 * One plugin: what it is called, what it is doing or why it is not, which of
 * the three states it is in, and the two things that can be done to it.
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
 *
 * The switch is a checkbox rather than a button with two labels, and its
 * `aria-label` names the state it is in rather than the one it would move to:
 * "enabled" beside a ticked box is what a screen reader says about it, and the
 * badge next to it says the same thing to the eye.
 */
function PluginRow({
  status,
  onChanged,
  onRemove,
}: {
  status: PluginStatus;
  onChanged: (plugins: readonly PluginBootstrap[]) => void;
  onRemove: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { port } = usePluginHost();
  const notices = useNotices();
  // The failure goes to the notice rather than under the row: it is about the
  // plugin as a whole and not about a value the user typed, and a row has no
  // room for a sentence beside a control that is one press wide.
  const { busy, run } = useCommand(notices.setError);
  const { word, variant } = STATES[status.state];
  const on = status.state !== 'disabled';
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
      <div className="flex shrink-0 items-center gap-3">
        <Checkbox
          checked={on}
          disabled={busy}
          // One name whatever the state: a checkbox says whether it is ticked
          // on its own, and a label that changed with the box would make the
          // control a different thing each time it was pressed. The badge
          // beside it says the same state to the eye.
          aria-label={t('pluginEnable')}
          onCheckedChange={(checked) =>
            void run(undefined, async () =>
              onChanged(await port.setEnabled(status.id, checked === true)),
            )
          }
        />
        <Badge variant={variant}>{t(word)}</Badge>
        <Tooltip text={t('pluginUninstall')}>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-destructive"
            aria-label={t('pluginUninstall')}
            disabled={busy}
            onClick={onRemove}
          >
            <Trash2 size={14} aria-hidden="true" />
          </Button>
        </Tooltip>
      </div>
    </li>
  );
}
