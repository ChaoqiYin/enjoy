import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Sheet, SheetContent, SheetTitle } from './ui/sheet';

/** A right-hand panel that slides in and out. The caller owns whether it is
 *  open and what goes inside; everything else — the shell, the slide, the
 *  backdrop, focus and the dialog semantics — lives here so that every drawer
 *  in the app behaves the same way.
 *
 *  The panel is a Radix `Sheet`, which is a dialog anchored to an edge: the
 *  portal, the backdrop, the focus trap, Escape, the scroll lock and the
 *  presence that holds the panel through its exit are all the library's. What
 *  is here is the contract the app puts on top of it.
 *
 *  The shell outlives the close. It is a frame the panel is drawn inside, it
 *  carries the drawer's modality, and `open` only flips what it says: the same
 *  element is in the document from the first render to the last, and `inert` is
 *  what takes it out of the tab order, the accessibility tree and hit testing
 *  while it is closed. Reaching for the drawer is therefore never a change of
 *  what exists, only of what the frame says.
 *
 *  The panel itself is Radix's, and so is its dialog role. That means two
 *  elements here are dialog-shaped while the drawer is open: this frame, and
 *  the panel the library portals to the end of the body. They never both count:
 *  a modal Radix panel marks everything outside itself — this frame included,
 *  since the portal puts the panel outside it — as `aria-hidden`, so what a
 *  screen reader is given is the panel, named by the heading inside it. The
 *  frame is what is left once the panel is gone.
 *
 *  Movement comes from exactly one place: the sheet's `animate-in`/`animate-out`
 *  with `slide-in-from-right`/`slide-out-to-right`, which is a keyframe
 *  animation of `transform`. daisyUI moved the panel with a `transition` of the
 *  `translate` property, and the two sum — an element mid-transition can be
 *  displaced twice, which is what played back as sliding too far and snapping
 *  back. daisyUI is gone from this app and its transition with it, so there is
 *  no second source to add to this one.
 *
 *  What Radix adds to how the drawer behaves, besides the movement: the focus
 *  trap, which the daisyUI shell never had (Tab used to walk out of the open
 *  drawer and onto the page behind it), and the scroll lock, which used to be a
 *  rule patched around the macOS title bar and is now the library's own. */
export function Drawer({
  open,
  title,
  closeLabel,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // Captured when the drawer opens rather than when it mounts: the shell mounts
  // with the page, so on the first render the active element is whatever the
  // user was on before they ever reached for the drawer.
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      previousFocus.current = document.activeElement as HTMLElement;
      return;
    }
    // Hand focus back as soon as the close starts rather than when the panel
    // finishes sliding away, so the keyboard never sits on a fading dialog.
    // Radix does not do this for a drawer: its own return targets the trigger
    // it was opened from, and this one is opened from state.
    previousFocus.current?.focus();
  }, [open]);
  return (
    // The shell is the full-viewport layer the drawer is drawn in, and it is
    // `inert` rather than `pointer-events-none` when closed: being unreachable
    // is what a closed drawer is, and `inert` holds for the keyboard and the
    // accessibility tree as well as for the mouse.
    <div
      role="dialog"
      aria-modal="true"
      inert={!open}
      className="fixed inset-0 z-40"
    >
      <Sheet
        open={open}
        modal
        onOpenChange={(next) => {
          // Escape and a press on the backdrop both arrive here as a close.
          if (!next) onClose();
        }}
      >
        <SheetContent
          ref={panel}
          closeLabel={closeLabel}
          // Focusable so that opening the drawer can put focus on the panel
          // itself — the heading is read first, and Tab goes on from here.
          tabIndex={-1}
          // The focus that arrives with the panel is taken here rather than
          // left to the library: Radix would land on the first tabbable thing
          // inside the panel, which is its close button, and a drawer that
          // opens by reading out a dismiss control before its own heading is
          // the wrong way round. The panel has no autofocus when a drawer
          // mounts already open, either — the effect above only runs on the
          // flip — so this is also what makes the first render behave like
          // every later one.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            panel.current?.focus();
          }}
          // The panel takes the width the drawer is allowed: the frame fills
          // the window and the sheet's own width is a fraction of it.
          className="block w-full max-w-[440px] space-y-5 overflow-y-auto p-6 outline-none"
        >
          {/* Named here rather than on the frame: this is what assistive
              technology is left with while the drawer is open, and Radix points
              the panel's own `aria-labelledby` at this heading. The padding
              clears the close button the sheet hangs in the corner. */}
          <SheetTitle className="pr-10 text-2xl leading-normal font-bold">
            {title}
          </SheetTitle>
          {children}
        </SheetContent>
      </Sheet>
    </div>
  );
}
