import { useTranslation } from 'react-i18next';
import { Navigate, useParams } from 'react-router';
import { useSpace } from '../features/space/SpaceProvider';
import { ScrollViewport } from '../shared/ScrollViewport';
import { usePluginHost } from './PluginHostProvider';
import { KERNEL } from './registry';
import type { PluginId } from './registry';

/**
 * Where a page a plugin registered is drawn.
 *
 * The navigation entry and the route are both built out of the same two facts —
 * which plugin, and the key it gave the page — so this is the other end of the
 * entry `MainNav` adds. What it draws is the plugin's own component, handed the
 * space the window is in and nothing else, which is the whole of what
 * `app.page` passes a plugin (`mountPoints.ts`).
 *
 * Two things around it are the kernel's rather than the plugin's, and both are
 * deliberate:
 *
 * - **It says whose page it is.** A plugin's page is drawn in the kernel's
 *   window and wears the kernel's chrome, so a user who cannot tell it apart
 *   from the kernel's own pages has no way to know what they are trusting. The
 *   strip above it names the plugin, and the surface it is drawn on is marked
 *   out from the page behind it.
 * - **The scroll is here.** The window clips, so a plugin page that is taller
 *   than the window would be cut off with no way to reach the rest of it; the
 *   page's own scrolling is not something a plugin can be trusted to remember.
 *
 * A place with no page on it — a plugin that has since been switched off, or a
 * link from before — goes to the list of what is installed, which is the page
 * that can answer it.
 */
export function PluginPageView() {
  const { t } = useTranslation();
  const { pluginId = '', page = '' } = useParams();
  const { registry, statuses, loading } = usePluginHost();
  const space = useSpace();
  const placement = registry
    .drawsAt('app.page', KERNEL)
    .find(
      ({ owner, contribution }) =>
        owner === pluginId && contribution.key === page,
    );
  // Nothing is drawn while the plugins are still being loaded, and nothing is
  // decided either: the page a deep link names is registered by the plugin that
  // is on its way, and sending the user away from it would be an answer given
  // before the question was asked.
  if (loading) return null;
  if (placement === undefined) return <Navigate to="/plugins" replace />;
  const name =
    statuses.find((status) => status.id === placement.owner)?.name ??
    placement.owner;
  const Drawn = placement.contribution.draw;
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-3 p-6">
      <p className="text-sm text-muted-foreground">
        {t('pluginPageBy', { plugin: name })}
      </p>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-dashed border-border bg-card">
        <ScrollViewport className="min-h-0 p-4">
          <Drawn space={{ id: space.id }} />
        </ScrollViewport>
      </div>
    </main>
  );
}

/**
 * Where a page a plugin registered is, as a route.
 *
 * Written once and read by both ends — the entry the navigation adds and the
 * route that draws it — so that the two cannot come apart. The two pieces are
 * escaped: they are a plugin's own names, and a name with a slash in it would
 * otherwise become two segments of the path.
 */
export function pluginPagePath(pluginId: PluginId, page: string): string {
  return `/plugins/${encodeURIComponent(pluginId)}/${encodeURIComponent(page)}`;
}
