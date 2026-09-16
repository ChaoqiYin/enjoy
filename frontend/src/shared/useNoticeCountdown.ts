import { useEffect, useRef, useState } from 'react';
import type { FocusEvent, MouseEvent } from 'react';
import { useLatestRef } from './useLatestRef';

// The progress bar only has to look like it is shrinking; ten steps a second is
// smoother than the eye needs and cheap enough to run beside a scan.
const TICK_MS = 100;

type Countdown = {
  /** `null` while the notice is resident and has no time to count down. */
  progress: { value: number; max: number } | null;
  /**
   * Spread onto the notice so hovering or focusing it holds the countdown.
   * React names the focus handlers `onFocus`/`onBlur` but wires them to the
   * native `focusin`/`focusout` events; the hover pair is the bubbling
   * `mouseover`/`mouseout` rather than the enter/leave pair React synthesises
   * from them, because the containment check below needs the raw event.
   */
  pauseProps: {
    onMouseOver: () => void;
    onMouseOut: (event: MouseEvent<HTMLElement>) => void;
    onFocus: () => void;
    onBlur: (event: FocusEvent<HTMLElement>) => void;
  };
};

function hasLeft(element: HTMLElement, next: EventTarget | null) {
  return !element.contains(next as Node | null);
}

/**
 * Counts a notice down to its own dismissal. The caller decides whether the
 * notice closes itself at all — omitting `durationMs` means it stays until the
 * user closes it — while this hook owns everything about how that time is
 * spent: how much is left, when it is held, and when it has run out. Keeping
 * it here rather than inside the notice keeps the timing separate from the
 * markup it drives.
 *
 * Remaining time is derived from timestamps rather than decremented once per
 * tick, so an interval that fires late does not stretch the countdown.
 */
export function useNoticeCountdown(
  durationMs: number | undefined,
  onClose: () => void,
): Countdown {
  const [remaining, setRemaining] = useState(durationMs ?? 0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remainingMs = useRef(durationMs ?? 0);
  const close = useLatestRef(onClose);

  // A new duration means a new notice in this slot: start over rather than
  // inherit the time the previous one had already spent. A replacement that
  // keeps the same duration arrives as a remount — the owner clears its slot
  // before refilling it — and re-initialising above is what gives the new
  // notice the full time. An in-place update is the same notice reporting
  // again and deliberately keeps counting.
  useEffect(() => {
    remainingMs.current = durationMs ?? 0;
    setRemaining(remainingMs.current);
  }, [durationMs]);

  // Two flags rather than one: moving the mouse away must not release a hold
  // that focus is still keeping.
  const held = hovered || focused;
  useEffect(() => {
    if (durationMs === undefined || held || remainingMs.current <= 0) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      remainingMs.current -= now - last;
      last = now;
      if (remainingMs.current > 0) {
        setRemaining(remainingMs.current);
        return;
      }
      remainingMs.current = 0;
      setRemaining(0);
      clearInterval(timer);
      close.current();
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [durationMs, held]);

  return {
    progress:
      durationMs === undefined ? null : { value: remaining, max: durationMs },
    pauseProps: {
      onMouseOver: () => setHovered(true),
      onMouseOut: (event) => {
        if (hasLeft(event.currentTarget, event.relatedTarget))
          setHovered(false);
      },
      onFocus: () => setFocused(true),
      onBlur: (event) => {
        if (hasLeft(event.currentTarget, event.relatedTarget))
          setFocused(false);
      },
    },
  };
}
