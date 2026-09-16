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
 * what daisyUI's `.toast` is: a fixed column, empty and transparent, that its
 * children are laid into. Which placement a notice asks for is therefore the
 * notice's own choice, and a component that reads as a different thing on
 * screen can say so without a second portal implementation here.
 *
 * The centre container is only as wide as what it holds. That matters for a
 * notice that swallows clicks rather than letting them through: the rectangle
 * it takes out of the page has to be the one the user can see, not a wider box
 * with invisible margins either side.
 */
const placements: Record<NoticePlacement, string> = {
  end: 'toast toast-top toast-end z-[1000] w-[min(32rem,100vw)] max-h-dvh overflow-y-auto whitespace-normal',
  center:
    'toast toast-top toast-center z-[1000] max-w-[min(20rem,90vw)] whitespace-normal',
};

const hosts = new Map<NoticePlacement, HTMLDivElement>();
const users = new Map<NoticePlacement, number>();
let observer: MutationObserver | null = null;
let exclusiveNotice: RegisteredNotice | null = null;

function attachHosts() {
  const dialogs = document.querySelectorAll('dialog[open]');
  const parent = dialogs.item(dialogs.length - 1) ?? document.body;
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
        attributeFilter: ['open'],
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
