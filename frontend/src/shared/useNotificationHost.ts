import { useEffect, useLayoutEffect, useState } from 'react';
import { useLatestRef } from './useLatestRef';

/** The one non-error notice currently on screen, and how to close it. */
type RegisteredNotice = { close: () => void };

let host: HTMLDivElement | null = null;
let users = 0;
let observer: MutationObserver | null = null;
let exclusiveNotice: RegisteredNotice | null = null;

function attachHost() {
  if (!host) return;
  const dialogs = document.querySelectorAll('dialog[open]');
  const parent = dialogs.item(dialogs.length - 1) ?? document.body;
  if (host.parentElement !== parent) parent.append(host);
}

export function useNotificationHost() {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!host) {
      host = document.createElement('div');
      host.className =
        'toast toast-top toast-end z-[1000] w-[min(32rem,100vw)] max-h-dvh overflow-y-auto whitespace-normal';
      host.dataset.notificationHost = '';
      attachHost();
      observer = new MutationObserver(attachHost);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['open'],
      });
    }
    users += 1;
    setElement(host);
    return () => {
      users -= 1;
      if (users === 0) {
        observer?.disconnect();
        observer = null;
        host?.remove();
        host = null;
      }
    };
  }, []);
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
