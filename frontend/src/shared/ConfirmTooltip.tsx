import { Button } from './ui/button';
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';
import type { ReactNode } from 'react';

type ConfirmTooltipProps = {
  children: ReactNode;
  message: string;
  onConfirm: () => void | Promise<void>;
  confirmLabel: string;
  cancelLabel: string;
  disabled?: boolean;
};

/**
 * A question hung off the control that was pressed, for the small destructive
 * acts that sit inside a page: removing a folder from the library, removing a
 * space. It is a popover rather than a dialog because the page behind it stays
 * live — nothing about answering is modal, and a panel that dimmed the page
 * would read as heavier than the act.
 *
 * The panel is `PopoverContent`, so the anchoring, the collision handling, the
 * Escape, the press outside it and the return of focus to the control are all
 * the library's. The panel carries no focus trap of its own: it is a small
 * panel of two buttons beside a control the user is still holding, not a second
 * window.
 *
 * `disabled` is the caller's, not the panel's: a control that cannot be pressed
 * is not one to hang a question from, so the child is handed back untouched and
 * nothing here is mounted for it.
 */
export function ConfirmTooltip({
  children,
  message,
  onConfirm,
  confirmLabel,
  cancelLabel,
  disabled = false,
}: ConfirmTooltipProps) {
  if (disabled) return <>{children}</>;
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      {/* The panel is named by the question it asks and announced as a panel,
          which is what it was before: without the name a screen reader would
          hear the control expand and then nothing. */}
      <PopoverContent
        align="end"
        className="w-72 p-3"
        role="dialog"
        aria-label={message}
      >
        <span className="block break-all text-sm">{message}</span>
        <span className="flex items-center justify-end gap-3 pt-3">
          {/* Both answers bring the panel down as well as doing their own
              thing: a question that stays up after it has been answered is not
              a question any more. */}
          <PopoverClose asChild>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void onConfirm()}
            >
              {confirmLabel}
            </Button>
          </PopoverClose>
          <PopoverClose asChild>
            <Button variant="secondary" size="sm">
              {cancelLabel}
            </Button>
          </PopoverClose>
        </span>
      </PopoverContent>
    </Popover>
  );
}
