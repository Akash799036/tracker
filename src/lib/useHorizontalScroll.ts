'use client';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Let a plain mouse wheel scroll a wide table sideways.
 *
 * The sheet scrollers are `overflow-auto` with no height cap, so they never
 * scroll vertically — the page does. A wheel over the table therefore scrolls
 * the page and the extra columns stay unreachable unless the user knows to hold
 * Shift or owns a trackpad. Translating vertical wheel deltas into horizontal
 * scrolling is what makes the columns reachable with an ordinary mouse.
 *
 * Returns a callback ref to put on the scroll container, plus `scrollBy` for
 * the toolbar's arrow buttons so both share one definition of the container.
 *
 * The ref is a callback, not a plain object ref: the table only renders once
 * the sheet data has loaded, so a mount-time `useEffect` would look at
 * `ref.current`, find null, and never bind. A callback ref instead fires
 * whenever the element attaches or detaches.
 */
export function useHorizontalScroll<T extends HTMLElement = HTMLDivElement>() {
  const elRef = useRef<T | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const scrollBy = useCallback((dx: number) => {
    elRef.current?.scrollBy({ left: dx, behavior: 'smooth' });
  }, []);

  const ref = useCallback((el: T | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    elRef.current = el;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      // A trackpad's sideways swipe already arrives as deltaX; only redirect
      // when the gesture is predominantly vertical, or we'd double-count it.
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;

      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return; // nothing to scroll — let the page have the wheel

      // At either end, release the wheel back to the page so the user can keep
      // scrolling past the table instead of getting stuck on it.
      const atStart = el.scrollLeft <= 0 && e.deltaY < 0;
      const atEnd = el.scrollLeft >= max - 1 && e.deltaY > 0;
      if (atStart || atEnd) return;

      // Line-mode wheels report deltaY in lines (~3), not pixels.
      const step = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      // scrollTo with 'auto' overrides the container's CSS scroll-smooth, which
      // would otherwise animate every notch and make the wheel feel laggy.
      el.scrollTo({ left: el.scrollLeft + step, behavior: 'auto' });
      e.preventDefault();
    };

    // Not passive: preventDefault is what stops the page scrolling underneath.
    el.addEventListener('wheel', onWheel, { passive: false });
    cleanupRef.current = () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Detach if the component unmounts without React nulling the ref first.
  useEffect(() => () => cleanupRef.current?.(), []);

  return { ref, scrollBy };
}
