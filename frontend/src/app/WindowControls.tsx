import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { backendEvents, windowApi } from '../shared/api';
import type { AppError } from '../shared/api';
import { ErrorNotice } from '../shared/ErrorNotice';
import { cn } from '../shared/ui/cn';
import { useCommand } from '../shared/useCommand';

/**
 * The three buttons in the titlebar's corner: minimize, maximize or restore, and
 * close.
 *
 * The window has no decorations (`tauri.conf.json`), so these are the buttons it
 * used to draw for itself, and they are the same three in the same order. What
 * is *not* copied is the decision behind the close — pressing this button asks
 * for a close, exactly as the platform's own did, and whether it is held while
 * the user is asked about a running 共享服务 is `crate::closing`'s
 * (`windowApi.requestClose`).
 *
 * The middle button's picture is a fact from the backend, subscribed to here
 * rather than remembered: the window is maximized just as well by a double click
 * on the title as by this button, and the button that lies about which of the
 * two it would do next is worse than no button. `crate::titlebar` has the why.
 *
 * A failure is shown rather than swallowed, at the corner of the screen, for the
 * reason `ShareProvider` gives about the close's: a button that did nothing must
 * not be left as a button that did nothing. There is no retry offered — the
 * thing to press again is the button that is still there.
 */
export function WindowControls() {
  const { t } = useTranslation();
  const [maximized, setMaximized] = useState(false);
  const [refused, setRefused] = useState<AppError | null>(null);
  const controls = useCommand(setRefused);
  useEffect(() => {
    // Subscribed for the life of the interface, like the close's question.
    let stop: (() => void) | undefined;
    let live = true;
    void backendEvents.onWindowMaximized(setMaximized).then((unlisten) => {
      // The subscription may come back after this effect was torn down.
      if (live) stop = unlisten;
      else unlisten();
    });
    return () => {
      live = false;
      stop?.();
    };
  }, []);
  return (
    <>
      <div className="flex h-full shrink-0 items-stretch">
        <WindowButton
          label={t('minimizeWindow')}
          glyph="window-glyph-minimize"
          onPress={() => controls.run(undefined, () => windowApi.minimize())}
        />
        <WindowButton
          label={t(maximized ? 'restoreWindow' : 'maximizeWindow')}
          glyph={maximized ? 'window-glyph-restore' : 'window-glyph-maximize'}
          onPress={() =>
            controls.run(undefined, () => windowApi.toggleMaximize())
          }
        />
        <WindowButton
          label={t('close')}
          glyph="window-glyph-close"
          closing
          onPress={() =>
            controls.run(undefined, () => windowApi.requestClose())
          }
        />
      </div>
      {refused && (
        <ErrorNotice error={refused} onClose={() => setRefused(null)} />
      )}
    </>
  );
}

/**
 * One of the three, drawn to the platform's measurements rather than the
 * application's: 46 by 32, no gap between them, flush to the corner, a square
 * corner and no shadow of its own. Three buttons of `shared/ui/button` would
 * have been the house rule, and they are the wrong instrument here — every one
 * of their sizes is a rounded square at least half again as tall as this bar,
 * and their variants carry an opaque surface that is exactly what the titlebar
 * is already painted with.
 *
 * The glyph is a mask painted with a background colour rather than an SVG with
 * an ink colour, which is what lets the closing one turn white under the pointer
 * without a `hover:` repainting a foreground — `components.css` carries the
 * argument and the shapes.
 */
function WindowButton({
  label,
  glyph,
  closing = false,
  onPress,
}: {
  label: string;
  glyph: string;
  /** The one that turns red and white under the pointer, as the platform's does. */
  closing?: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onPress}
      className={cn(
        'flex h-full w-[46px] items-center justify-center bg-background focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
        closing ? 'group/close hover:bg-window-close' : 'hover:bg-hover',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'window-glyph size-[10px] bg-foreground',
          // Only ever matched on the closing one, whose button is the only
          // `group/close` in the window.
          closing && 'group-hover/close:bg-window-close-foreground',
          glyph,
        )}
      />
    </button>
  );
}
