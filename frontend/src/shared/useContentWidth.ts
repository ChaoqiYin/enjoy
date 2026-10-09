import { useLayoutEffect, useRef, useState } from 'react';

/**
 * How wide a box's own content area is, kept up to date as the window changes.
 *
 * The box's padding is taken off, because what a grid inside it is being sized
 * for is the room left after the padding — the same measurement that decides how
 * many columns fit, and the reason the room the hover feedback needs (a padding
 * on the same edge) does not count towards it.
 *
 * Read from the element rather than from the window, so a grid measures the
 * space it is actually in: the page it sits on may be narrower than the window,
 * and it is the page's width that the columns have to follow.
 *
 * Zero until the first measurement, which is the answer that renders one column:
 * a wrong guess would be a grid laid out for a width it does not have, and one
 * column is the least wrong of the possibilities.
 */
export function useContentWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const style = getComputedStyle(element);
      setWidth(
        Math.max(
          0,
          element.clientWidth -
            (parseFloat(style.paddingLeft) || 0) -
            (parseFloat(style.paddingRight) || 0),
        ),
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
