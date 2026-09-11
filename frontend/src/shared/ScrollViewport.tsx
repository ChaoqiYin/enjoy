import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import type { ComponentPropsWithoutRef } from 'react';

export const ScrollViewport = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<'div'>
>(function ScrollViewport({ className = '', ...props }, forwardedRef) {
  const viewport = useRef<HTMLDivElement>(null);
  useImperativeHandle(forwardedRef, () => viewport.current!);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const update = () => {
      const style = getComputedStyle(element);
      const borders =
        (parseFloat(style.borderLeftWidth) || 0) +
        (parseFloat(style.borderRightWidth) || 0);
      const gutter = Math.max(
        0,
        element.offsetWidth - element.clientWidth - borders,
      );
      const value = `${gutter}px`;
      if (
        element.style.getPropertyValue('--native-scrollbar-width') !== value
      ) {
        element.style.setProperty('--native-scrollbar-width', value);
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div {...props} ref={viewport} className={`scroll-viewport ${className}`} />
  );
});
