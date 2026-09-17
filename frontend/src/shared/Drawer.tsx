import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

/** A right-hand panel that slides in and out. The caller owns whether it is
 *  open and what goes inside; everything else — the daisyUI shell, the
 *  animation, the backdrop, focus and the dialog semantics — lives here so
 *  that every drawer in the app behaves the same way.
 *
 *  The slide is daisyUI's own: its `translate` transition on the panel, run by
 *  the `:checked` state of the toggle. That is the only thing that moves the
 *  panel, which is why the shell must stay mounted for as long as the caller is
 *  on screen — a transition needs a previous value to move away from, so a
 *  shell that mounted already-open would pop in with no animation. `open` only
 *  ever flips that toggle. daisyUI's `.drawer-side` rules carry the rest of the
 *  open state with it: the backdrop's opacity, and the `visibility` and
 *  `pointer-events` that decide whether the closed drawer can be reached. */
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
  const titleId = useId();
  // Captured when the drawer opens rather than when it mounts: the shell now
  // mounts with the page, so on the first render the active element is whatever
  // the user was on before they ever reached for the drawer.
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      previousFocus.current = document.activeElement as HTMLElement;
      panel.current?.focus();
      return;
    }
    // Hand focus back as soon as the close starts rather than when the panel
    // finishes sliding away, so the keyboard never sits on a fading dialog.
    previousFocus.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    // The shell is a full-viewport overlay now that it outlives the close, so it
    // has to opt out of hit testing: daisyUI only clears `pointer-events` on
    // `.drawer-side`, and that rule hands it back while the drawer is open.
    <div
      className="drawer drawer-end fixed inset-0 z-40 pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      // The shell stays mounted once closed, so `inert` is what takes it out of
      // the tab order and the accessibility tree until it is opened again.
      inert={!open}
    >
      {/* daisyUI hides the toggle itself (fixed, zero-sized, transparent), but
          hidden is not the same as unfocusable; `tabIndex` keeps it from
          becoming a stop the keyboard can land on. */}
      <input
        type="checkbox"
        className="drawer-toggle"
        checked={open}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
      />
      <div className="drawer-content" />
      <div className="drawer-side">
        {/* A button only so that a click anywhere on it closes the drawer; it
            is not a control the user aims at. daisyUI marks every
            `.drawer-overlay` with a pointer cursor, which would put a hand over
            most of the screen and drown out the same hand on the things the
            user does aim at — the panel's own buttons, a video card. daisyUI's
            own `.modal-backdrop` carries no such rule, so clearing it here is
            also what keeps the two backdrops in this app reading alike.
            The utility wins over the component class because daisyUI nests its
            rules in a sublayer of `utilities`, where this one lands directly. */}
        <button
          className="drawer-overlay cursor-default"
          aria-label={closeLabel}
          onClick={onClose}
        />
        {/* The shade along the panel's top edge is an inset shadow rather than
            a cast one: that edge sits on `.drawer-side`'s own top, and that
            container clips its overflow, so anything cast upwards would be cut
            away before it could show under the title bar. */}
        <div
          ref={panel}
          tabIndex={-1}
          className="bg-base-100 h-full w-full max-w-[440px] overflow-y-auto p-6 space-y-5 outline-none shadow-[inset_0_10px_14px_-10px_rgb(0_0_0_/_0.18)]"
        >
          <div className="flex items-center justify-between">
            <h2 id={titleId} className="text-2xl font-bold">
              {title}
            </h2>
            <button
              className="btn btn-outline btn-sm btn-square btn-neutral"
              aria-label={closeLabel}
              onClick={onClose}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
