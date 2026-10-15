import { WindowControls } from './WindowControls';

/**
 * The strip along the top of the window: what the window is, and the three
 * buttons that used to be the platform's.
 *
 * It exists because the platform's titlebar does not follow the application's
 * theme — it follows the *system's* light or dark appearance, so a user who
 * picked light while the system is dark gets a dark band over a light page. The
 * window is therefore created without decorations (`tauri.conf.json`) and this
 * draws what was taken away, which means it is an ordinary surface: `bg-background`
 * is the same token the page below is painted with, and switching the theme
 * switches this with it.
 *
 * A strip of its own rather than the header wearing the job: the header's
 * geometry is otherwise not this change's business — its height, its padding and
 * its three clusters are measured in ADRs 0024 and 0038 — and a second row is
 * what a window with a titlebar of its own actually looks like. What it costs is
 * 32 pixels of height and one more "Enjoy" on screen, both taken deliberately.
 *
 * `data-tauri-drag-region="deep"` is what makes the strip draggable, and it is
 * Tauri's own script that reads it, on mousedown, asking the window to start
 * dragging. `deep` covers clicks anywhere in the subtree, and the buttons are
 * left out of it without being named: the script skips anything that is a
 * button, a link, a field or a focusable thing, which is every control that will
 * ever sit here (`src-tauri/capabilities/main.json` carries the permission the
 * script's call needs). A double click along the same strip maximizes, which
 * costs nothing — the same call the maximize button makes.
 */
export function TitleBar() {
  return (
    <div
      data-tauri-drag-region="deep"
      className="flex h-[32px] shrink-0 items-center justify-between bg-background pl-4 select-none"
    >
      {/* The product name, which is not translated: it is what the application
          is called rather than something said about it, the same reading
          `BrandLogo`'s label takes of the same word.

          `min-w-0` and `truncate` are the whole reason it can give way: a flex
          child does not shrink below its content on its own, and the three
          buttons are `shrink-0` — so without this a window narrow enough would
          push the close button past the right edge and off the screen, where
          nothing can reach it. The name is the part that can go. */}
      <span className="min-w-0 truncate text-sm text-muted-foreground">
        Enjoy
      </span>
      <WindowControls />
    </div>
  );
}
