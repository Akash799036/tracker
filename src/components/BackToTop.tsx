'use client';

import { useEffect, useState } from 'react';
import { useGsap } from '@/lib/useGsap';

/** How far down the page the user must be before the button appears. */
const SHOW_AFTER = 400;

/**
 * Floating "back to top" button, bottom-right.
 *
 * Hidden until the page is scrolled past SHOW_AFTER so it never covers content
 * on a short page.
 *
 * z-25 is deliberate: above the sticky Topbar (z-20) and the sheet toolbar
 * (z-10), but below the mobile Sidebar drawer and its backdrop (z-40 / z-30),
 * the ExportMenu dropdown (z-30), the Modal portal (z-[1000]) and the sync
 * splash (z-[9999]) — so it never floats over an open drawer or dialog.
 */
export default function BackToTop() {
  const [visible, setVisible] = useState(false);
  const buttonRef = useGsap<HTMLButtonElement>('fade');

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER);
    onScroll(); // catch a restored scroll position on mount
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const toTop = () => {
    // Respect a user's reduced-motion setting rather than always animating.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <button ref={buttonRef}
      type="button"
      onClick={toTop}
      aria-label="Back to top"
      title="Back to top"
      // aria-hidden + inert while invisible so it stays out of the tab order
      // and off screen readers instead of being a silent focus trap.
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={`fixed bottom-6 right-6 z-[25] h-11 w-11 grid place-items-center rounded-full
        bg-brand-600 text-white shadow-card ring-1 ring-black/5
        hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300
        transition-[opacity,transform] duration-200 motion-reduce:transition-none
        ${visible ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 translate-y-2'}`}
    >
      <svg
        width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      >
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  );
}
