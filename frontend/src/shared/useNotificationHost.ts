import { useLayoutEffect, useState } from 'react';

let host: HTMLDivElement | null = null;
let users = 0;
let observer: MutationObserver | null = null;

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
