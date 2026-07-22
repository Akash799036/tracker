'use client';
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

/**
 * Hook to animate an element when it appears.
 * Options: type = 'fade' | 'slide' | 'scale',
 * duration in seconds, delay, and optional ease.
 */
export function useGsap<T extends HTMLElement = HTMLElement>(
  type: 'fade' | 'slide' | 'scale' = 'fade',
  options: {duration?: number; delay?: number; ease?: string} = {}
) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const {duration = 0.4, delay = 0, ease = 'power2.out'} = options;
    switch (type) {
      case 'fade':
        gsap.fromTo(el, {autoAlpha: 0}, {autoAlpha: 1, duration, delay, ease});
        break;
      case 'slide':
        gsap.fromTo(el, {y: 20, autoAlpha: 0}, {y: 0, autoAlpha: 1, duration, delay, ease});
        break;
      case 'scale':
        gsap.fromTo(el, {scale: 0.9, autoAlpha: 0}, {scale: 1, autoAlpha: 1, duration, delay, ease});
        break;
    }
  }, []);
  return ref;
}
