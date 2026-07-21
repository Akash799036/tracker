'use client';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Pan a wide/tall table by dragging it, and suppress mouse-wheel scrolling
 * *inside* the table.
 *
 * The sheet scrollers are `overflow-auto`, so by default a wheel over the table
 * scrolls it (and, at the page level, the whole document). We deliberately turn
 * that off: a wheel notch does nothing to the sheet. Instead the user grabs the
 * sheet — press and hold the mouse button, then move — and it follows the
 * cursor in both axes, like dragging a map. Releasing the button, or leaving the
 * element, ends the drag.
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

    // 1) Stop the wheel from scrolling the *sheet's own* content — sheet
    //    navigation is drag-only by request — but let the wheel keep scrolling
    //    the page up and down as usual.
    //
    //    The sheet scroller can overflow horizontally (extra columns) and, if it
    //    ever gains a height cap, vertically too. We only cancel a wheel notch
    //    when it would actually move the sheet in a direction the sheet can
    //    scroll; otherwise we let the event bubble to the page so the document
    //    scrolls normally even with the cursor over the table.
    const onWheel = (e: WheelEvent) => {
      const canScrollX = el.scrollWidth - el.clientWidth > 0;
      const canScrollY = el.scrollHeight - el.clientHeight > 0;

      // Predominantly-horizontal gesture (trackpad swipe / shift+wheel) that the
      // sheet could act on: swallow it so the columns stay put.
      if (canScrollX && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        return;
      }

      // Vertical wheel: only swallow it if the sheet itself is a vertical
      // scroller (has its own height cap). With no cap the sheet grows to fit
      // its rows and the page owns vertical scrolling — so we do nothing and let
      // the page scroll.
      if (canScrollY && e.deltaY !== 0) {
        e.preventDefault();
      }
    };

    // 2) Drag-to-pan. Track the press origin and the scroll offset at press
    //    time, then follow the pointer. Uses Pointer Events so mouse, pen and
    //    touch all work.
    //
    //    A press does NOT immediately start a drag or capture the pointer: doing
    //    so would swallow the click/dblclick a cell needs to select or enter
    //    edit mode. Instead the press is "armed", and the drag only begins —
    //    capturing the pointer — once the cursor actually moves past a small
    //    threshold. A press with no movement stays a plain click.
    const DRAG_THRESHOLD = 4; // px before a press becomes a pan
    let armed = false;   // pointer is down on a pannable area, not yet dragging
    let dragging = false; // threshold crossed — actively panning
    let pointerId = -1;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onPointerDown = (e: PointerEvent) => {
      // Only the primary (usually left) button starts a pan, and never when the
      // press lands on an interactive control (an input being edited, a link,
      // or a button) — those need their own click/drag behaviour.
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;

      const maxX = el.scrollWidth - el.clientWidth;
      const maxY = el.scrollHeight - el.clientHeight;
      if (maxX <= 0 && maxY <= 0) return; // nothing to pan

      armed = true;
      dragging = false;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = el.scrollLeft;
      startTop = el.scrollTop;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!armed) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      // Promote an armed press to a real drag only once it clearly moves. Until
      // then, leave the click machinery alone so a tap still selects the cell.
      if (!dragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        dragging = true;
        // Capture now so a drag that wanders off the element keeps tracking.
        try { el.setPointerCapture(pointerId); } catch { /* fine without capture */ }
        el.style.cursor = 'grabbing';
        el.style.userSelect = 'none';
        // The container ships with `scroll-smooth` (scroll-behavior: smooth),
        // which animates every scrollLeft/scrollTop write. During a drag we
        // write the offset many times a second, and the browser cancels each
        // in-flight animation with the next write, so the sheet never actually
        // moves. Force instant scrolling for the duration of the drag.
        el.style.scrollBehavior = 'auto';
      }

      // Move the content opposite the cursor: dragging right reveals the columns
      // to the left, like pushing a sheet of paper.
      el.scrollLeft = startLeft - dx;
      el.scrollTop = startTop - dy;
      e.preventDefault();
    };

    const endDrag = (e: PointerEvent) => {
      if (!armed) return;
      armed = false;
      if (dragging) {
        dragging = false;
        try { el.releasePointerCapture(e.pointerId); } catch { /* already released */ }
        el.style.cursor = '';
        el.style.userSelect = '';
        el.style.scrollBehavior = ''; // restore the CSS `scroll-smooth` default
        // Suppress the click the browser would synthesize at the end of a drag,
        // so releasing a pan never also selects a cell under the cursor.
        const swallow = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); };
        el.addEventListener('click', swallow, { capture: true, once: true });
        // If no click fires (e.g. released outside), don't leave the trap armed.
        setTimeout(() => el.removeEventListener('click', swallow, { capture: true } as EventListenerOptions), 0);
      }
    };

    // A grab affordance while idle.
    el.style.cursor = 'grab';

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    cleanupRef.current = () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endDrag);
      el.removeEventListener('pointercancel', endDrag);
      el.style.cursor = '';
      el.style.userSelect = '';
      el.style.scrollBehavior = '';
    };
  }, []);

  // Detach if the component unmounts without React nulling the ref first.
  useEffect(() => () => cleanupRef.current?.(), []);

  return { ref, scrollBy };
}
