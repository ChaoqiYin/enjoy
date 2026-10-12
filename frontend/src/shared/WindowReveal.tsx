import { useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import { windowApi } from './api';

/**
 * Asks the backend to show the window, once React has committed what will be on
 * it.
 *
 * The window is created hidden (`visible: false` in `tauri.conf.json`) and the
 * backend does not show it, so it stays off the screen until this side says it
 * has drawn. That is the whole of it, and it is what replaced the startup splash.
 *
 * What it buys is a window period the length of the reads and the first render
 * that used to happen behind a shown window, cut down to the fraction of a second
 * WebKit takes to composite a view it has just found on screen. Not to zero: the
 * window is up before that composite lands, and what is on it until then is
 * WebKit's own background rather than anything this side drew. Measured at
 * roughly two tenths of a second, and recorded in ADR 0037 §三 — short enough
 * that a splash covering it would be the larger artefact of the two.
 *
 * The moment to ask is the commit, not the theme having been read. Reading the
 * theme is one step towards a drawn interface, and a window shown on it would put
 * an unstyleable page on screen — in the development build the stylesheet is a
 * module import, so it arrives with the script, and until then the page is the
 * browser's own white.
 *
 * A layout effect rather than a passive one, and the reason is not a frame.
 * Nothing the page does is composited while its window is ordered out — WebKit
 * ties its rendering updates, and `requestAnimationFrame`, to the view being on
 * screen — so whichever effect asks, the paint happens after the window appears
 * and the two cannot differ in what that first frame shows. What is left to
 * choose between is how many scheduled turns the reveal sits behind, and the
 * answer is none: a layout effect runs inside the commit that had to happen for
 * there to be an interface at all, while a passive effect is a second callback
 * the scheduler still has to deliver. The window appearing is not the thing to
 * leave waiting on that delivery.
 *
 * Both ways `main.tsx` can finish go through here, and that is not a formality.
 * The startup notice is drawn by the same root the app is, and the window is
 * shown by what this component asks for — so a notice outside it would be a
 * failure reported to nobody, in the one case where nothing else reaches the
 * screen either.
 */
export function WindowReveal({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    // The rejection is dropped, and this is not a fallback. The failure has
    // already been reported where it can be seen — natively, by the backend,
    // with the error id — and there is nothing this side could do with it: the
    // window it would draw a notice in is the window that did not appear. Letting
    // it escape would only print an unhandled rejection into a console nobody
    // has.
    windowApi.show().catch(() => undefined);
  }, []);
  return <>{children}</>;
}
