import { useEffect, useRef, useState } from 'react';
import type { FocusEvent, MouseEvent } from 'react';
import { useLatestRef } from './useLatestRef';

type Countdown = {
  /**
   * What the line along the notice's edge needs to drain itself, or `null`
   * while the notice is resident and has no time to count down.
   */
  indicator: { durationMs: number; held: boolean } | null;
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
 * That time is spent on two clocks which have to agree: this one, which decides
 * when to close the notice, and the line's own animation, which the engine runs
 * on the compositor. They are armed together, held together, and released
 * together, so the line the user sees is the line this hook has left. What the
 * browser is trusted with is only the drawing between those moments — a line
 * redrawn from here would be one React render per step, and a step is missed or
 * arrives late exactly when the main thread is busy, which for a notice sitting
 * beside the end of a scan is most of the time.
 *
 * The remaining time is derived from timestamps rather than counted down once
 * per step, so a clock that is held does not stretch the countdown: time spent
 * held is not spent, and time spent running is spent in full.
 */
export function useNoticeCountdown(
  durationMs: number | undefined,
  onClose: () => void,
): Countdown {
  const [held, setHeld] = useState(false);
  const remainingMs = useRef(durationMs ?? 0);
  const close = useLatestRef(onClose);

  // A new duration means a new notice in this slot: start over rather than
  // inherit the time the previous one had already spent. A replacement that
  // keeps the same duration arrives as a remount — the owner clears its slot
  // before refilling it — and starting from the duration the hook was born with
  // is what gives the new notice the full time. An in-place update is the same
  // notice reporting again, and deliberately keeps counting.
  useEffect(() => {
    remainingMs.current = durationMs ?? 0;
  }, [durationMs]);

  // One timeout for the whole remaining time rather than a step per fraction of
  // it, and the cleanup is where the remaining time is banked: an instance that
  // stops — the notice is held, retimed, or taken off the screen — is an
  // instance that has spent everything since it started. React runs the
  // cleanups before the setups of the same commit, so a hold banks its time
  // before the idled hook reads it back, and a new duration is banked before
  // the reset above overwrites it.
  useEffect(() => {
    if (durationMs === undefined || held || remainingMs.current <= 0) return;
    const startedAt = performance.now();
    const timer = setTimeout(() => {
      remainingMs.current = 0;
      close.current();
    }, remainingMs.current);
    return () => {
      clearTimeout(timer);
      // Clamped because the timer may already have run the remaining time down
      // to zero before the notice unmounts, and a spent countdown must not bank
      // a negative one.
      remainingMs.current = Math.max(
        0,
        remainingMs.current - (performance.now() - startedAt),
      );
    };
  }, [durationMs, held]);

  return {
    indicator: durationMs === undefined ? null : { durationMs, held },
    pauseProps: {
      onMouseOver: () => setHeld(true),
      onMouseOut: (event) => {
        if (hasLeft(event.currentTarget, event.relatedTarget)) setHeld(false);
      },
      onFocus: () => setHeld(true),
      onBlur: (event) => {
        if (hasLeft(event.currentTarget, event.relatedTarget)) setHeld(false);
      },
    },
  };
}
