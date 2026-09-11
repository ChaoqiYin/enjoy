import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Video } from '../../shared/api';
import type { VideoActionHandlers } from './VideoActions';

export interface MenuTarget {
  video: Video;
  x: number;
  y: number;
}

export function VideoMenu({
  target,
  busy,
  actions,
  onClose,
}: {
  target: MenuTarget;
  busy: boolean;
  actions: VideoActionHandlers;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const menu = useRef<HTMLUListElement>(null);
  const [position, setPosition] = useState({ x: target.x, y: target.y });
  useLayoutEffect(() => {
    const rect = menu.current!.getBoundingClientRect();
    setPosition({
      x: Math.max(8, Math.min(target.x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(target.y, window.innerHeight - rect.height - 8)),
    });
  }, [target]);
  useEffect(() => {
    const previous = document.activeElement;
    menu.current
      ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
      ?.focus();
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', onClose);
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [onClose]);
  const items = [
    { key: 'details', action: actions.details, disabled: false },
    {
      key: 'play',
      action: actions.play,
      disabled: busy || !target.video.available,
    },
    {
      key: target.video.favorite ? 'unfavorite' : 'favorites',
      action: actions.favorite,
      disabled: busy,
    },
    { key: 'reveal', action: actions.reveal, disabled: busy },
    {
      key: 'regenerate',
      action: actions.regenerate,
      disabled: busy || !target.video.available,
    },
    { key: 'removeIndex', action: actions.remove, disabled: busy },
  ];
  function keyboard(event: KeyboardEvent) {
    if (event.key === 'Escape' || event.key === 'Tab') {
      onClose();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(
      menu.current!.querySelectorAll<HTMLButtonElement>(
        'button:not(:disabled)',
      ),
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
            buttons.length;
    buttons[next]?.focus();
  }
  return (
    <ul
      ref={menu}
      role="menu"
      aria-label={target.video.file_name}
      className="menu fixed z-30 bg-base-200 border border-base-300 rounded-box shadow-xl w-64 max-w-[calc(100vw-16px)]"
      style={{ left: position.x, top: position.y }}
      onKeyDown={keyboard}
    >
      {items.map((item) => (
        <li key={item.key} role="none">
          <button
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.action(target.video);
            }}
          >
            {t(item.key)}
          </button>
        </li>
      ))}
    </ul>
  );
}
