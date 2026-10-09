import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Video } from '../../shared/api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../shared/ui/dropdown-menu';
import type { VideoActionHandlers } from './VideoActions';

/** Where the pointer asked for the menu, and the record it is about. */
export interface MenuTarget {
  video: Video;
  x: number;
  y: number;
}

/**
 * What can be done with one record, opened where the pointer asked for it.
 *
 * The menu is the same list of actions the card and the row show, opened from a
 * point rather than from a control: the caller draws it when it has a target —
 * a right-click or the keyboard's own context-menu gesture — and unmounts it
 * when `onClose` says the menu is done. Nothing here holds the open state, so
 * the two views that open it keep one piece of state between them rather than
 * one each.
 *
 * The list itself and the dismissal are the primitive's (`dropdown-menu`), and
 * what this file adds is the anchor: a menu that drops from the pointer has no
 * control to hang off, so the trigger is an empty, zero-size element placed at
 * the point the pointer asked. Radix positions the panel against it, flips it
 * near an edge of the window and keeps it inside, which is the part that used to
 * be measured by hand here.
 *
 * Two things about that anchor are worth saying out loud, because both are
 * consequences of it not being a real control. It is not reachable by Tab and
 * not announced, since it is not a thing a user chose; and the focus that comes
 * back when the menu closes is put back on whatever was focused when it opened
 * — the card or the row the gesture was made on — rather than on the invisible
 * anchor, which keeps a keyboard user where they were.
 *
 * The item for the 共享清单 follows the record rather than standing as two
 * entries, as the favorite beside it does: one item whose words follow the state
 * rather than two that sit side by side, and the state it follows is the
 * record's, so it reads the list the video is already on.
 */
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
  const content = useRef<HTMLDivElement>(null);
  // What had the focus when the menu opened, read once through a lazy initial
  // value: it is where the focus goes back to when the menu closes.
  const [previous] = useState<Element | null>(() => document.activeElement);
  useEffect(() => {
    // Keyboard users arrive here by a gesture on the card, so the pointer is
    // nowhere near the menu and the keys have to start somewhere: the first item
    // that can be chosen, skipped past the ones the running task has taken.
    content.current
      ?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled])')
      ?.focus();
  }, []);
  useEffect(() => {
    // The menu hangs from a point and not from a control, so it cannot follow
    // what it is beside: a scroll anywhere, or a resize, leaves it pointing at
    // nothing. Either one closes it, which is also what a user expects of a
    // menu opened by a right-click.
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);
  const items = [
    { key: 'details', action: actions.details, disabled: false },
    { key: 'play', action: actions.play, disabled: busy },
    {
      key: target.video.favorite ? 'unfavorite' : 'favorites',
      action: actions.favorite,
      disabled: busy,
    },
    {
      key: target.video.shared ? 'unshare' : 'share',
      action: actions.share,
      disabled: busy,
    },
    { key: 'reveal', action: actions.reveal, disabled: busy },
    { key: 'regenerate', action: actions.regenerate, disabled: busy },
    { key: 'removeIndex', action: actions.remove, disabled: busy },
  ];
  return (
    <DropdownMenu
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DropdownMenuTrigger asChild>
        {/* The anchor: the point the pointer asked for, drawn as nothing. */}
        <span
          aria-hidden="true"
          tabIndex={-1}
          className="pointer-events-none fixed z-50 block size-0"
          style={{ left: target.x, top: target.y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        ref={content}
        align="start"
        side="bottom"
        sideOffset={4}
        collisionPadding={8}
        // The primitive names a menu by the words on its trigger, which is the
        // right answer for a menu that drops from a button and the wrong one
        // here: the anchor is empty. The record's own name is what this menu is
        // about, so it is the name it carries.
        aria-labelledby={undefined}
        aria-label={target.video.file_name}
        className="w-64"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const element = previous;
          if (element instanceof HTMLElement && element.isConnected)
            element.focus();
        }}
      >
        {items.map((item) => (
          <DropdownMenuItem
            key={item.key}
            disabled={item.disabled}
            onSelect={() => item.action(target.video)}
          >
            {t(item.key)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
