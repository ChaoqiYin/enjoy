import { useEffect, useLayoutEffect, useState } from 'react';
import { useLatestRef } from './useLatestRef';

/** The one non-error notice currently on screen, and how to close it. */
type RegisteredNotice = { close: () => void };

/**
 * Where a floating notice sits on screen. Every notice of one placement shares
 * the same container, so two notices of the same placement stack instead of
 * overlapping each other.
 */
export type NoticePlacement = 'end' | 'center';

/**
 * The container is what carries the position and the width, because that is
 * what a placement is: a fixed column, empty and transparent, that its children
 * are laid into. Which placement a notice asks for is therefore the notice's
 * own choice, and a component that reads as a different thing on screen can say
 * so without a second portal implementation here.
 *
 * The offset from the edge is the container's own padding-free `top-4 right-4`,
 * so a notice is inset from the window rather than flush against it.
 *
 * The centre container is only as wide as what it holds. That matters for a
 * notice that swallows clicks rather than letting them through: the rectangle
 * it takes out of the page has to be the one the user can see, not a wider box
 * with invisible margins either side. The end container is a column of one
 * agreed width instead, so notices of different lengths line up along the same
 * right edge.
 */
const placements: Record<NoticePlacement, string> = {
  end: 'fixed top-4 right-4 z-[1000] flex w-[min(32rem,calc(100vw-2rem))] flex-col gap-3',
  center:
    'fixed top-4 left-1/2 z-[1000] flex max-w-[min(20rem,90vw)] -translate-x-1/2 flex-col items-center gap-3',
};

/**
 * What counts as an overlay a notice has to be placed inside to stay reachable.
 *
 * A native `<dialog open>` is one: the scan-progress panel is one of those, and
 * it takes the rest of the page out of the accessibility tree while it is up.
 * The overlays the rest of the app uses are Radix's, and Radix portals its
 * panel to the end of the body rather than into a `<dialog>` — so the native
 * selector alone would leave a notice behind the panel it was raised from. The
 * open Radix panel is matched by the role and state Radix gives it.
 *
 * Popper-anchored panels are excluded: a popover or a tooltip carries
 * `role="dialog"` and the same `data-state`, but it is a small panel hung off a
 * control, not a modal, and a notice laid into one would be clipped by it and
 * carried around by it.
 */
const overlaySelector =
  'dialog[open], [role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]';

const popperWrapper = '[data-radix-popper-content-wrapper]';

const hosts = new Map<NoticePlacement, HTMLDivElement>();
const users = new Map<NoticePlacement, number>();
let observer: MutationObserver | null = null;
let exclusiveNotice: RegisteredNotice | null = null;

/**
 * Puts every container inside the topmost overlay that is open, and back at the
 * root when none is.
 *
 * The move is what keeps a notice visible and operable while a dialog is up:
 * a modal overlay takes everything outside itself out of the accessibility tree
 * — which would silence a notice left at the root — and Radix withholds pointer
 * events from all of it, which would leave one unclickable there. Inside the
 * panel the notice is both, and is painted with it rather than behind it.
 *
 * The panel is found rather than declared, so a notice raised from a page knows
 * nothing about the drawer or the dialog it has to travel with.
 */
function attachHosts() {
  const overlays = Array.from(
    document.querySelectorAll<HTMLElement>(overlaySelector),
  ).filter((overlay) => !overlay.closest(popperWrapper));
  const parent = overlays[overlays.length - 1] ?? document.body;
  for (const host of hosts.values()) {
    if (host.parentElement !== parent) parent.append(host);
  }
}

export function useNotificationHost(placement: NoticePlacement) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    let host = hosts.get(placement);
    if (!host) {
      host = document.createElement('div');
      host.className = placements[placement];
      host.dataset.notificationHost = placement;
      hosts.set(placement, host);
      attachHosts();
    }
    if (!observer) {
      observer = new MutationObserver(attachHosts);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        // `open` is a native dialog's, `data-state` is Radix's. Watching the
        // child list as well is what catches an overlay being added or taken
        // away, which is how every portal arrives and leaves.
        attributeFilter: ['open', 'data-state'],
      });
    }
    users.set(placement, (users.get(placement) ?? 0) + 1);
    setElement(host);
    return () => {
      const remaining = (users.get(placement) ?? 1) - 1;
      users.set(placement, remaining);
      if (remaining > 0) return;
      hosts.get(placement)?.remove();
      hosts.delete(placement);
      if (hosts.size > 0) return;
      observer?.disconnect();
      observer = null;
    };
  }, [placement]);
  return element;
}

/**
 * Keeps notices that are not errors down to a single slot: registering one
 * closes whatever it replaces. The notice being replaced is closed through its
 * own `onClose` rather than merely hidden, because a notice's visibility
 * belongs to the state its owner holds — hiding it without clearing that state
 * puts it straight back on the next render.
 *
 * Errors never register, so they neither displace other notices nor are
 * displaced by them; several errors still stack in the shared host.
 *
 * React runs the effects of a notice being unmounted before those of the one
 * mounting in its place, so a slot replaced by its own successor has already
 * unregistered by the time the successor looks for something to close. That is
 * what keeps this from calling the outgoing notice's `onClose` — which clears
 * its slot unconditionally — after the new content was written into it.
 */
export function useExclusiveNotice(exclusive: boolean, onClose: () => void) {
  const close = useLatestRef(onClose);
  useEffect(() => {
    if (!exclusive) return;
    const self: RegisteredNotice = { close: () => close.current() };
    const replaced = exclusiveNotice;
    exclusiveNotice = self;
    replaced?.close();
    return () => {
      if (exclusiveNotice === self) exclusiveNotice = null;
    };
  }, [exclusive, close]);
}
