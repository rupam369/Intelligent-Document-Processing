/**
 * useInView - reports when an element scrolls into the viewport.
 *
 * Falls back to "visible" when IntersectionObserver is missing, and always
 * reveals the element after a grace period so content can never get stuck
 * invisible if the observer misbehaves.
 */
import { useEffect, useRef, useState } from 'react';

/** Grace period before we force-reveal, so nothing can stay hidden forever. */
const FALLBACK_DELAY_MS = 2500;

export function useInView(options = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    // No observer support (very old browsers, some test environments).
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((entry) => entry.isIntersecting);
        if (hit) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -32px 0px', ...options },
    );

    observer.observe(node);

    // Safety net: never leave content permanently hidden.
    const fallback = setTimeout(() => {
      setInView(true);
      observer.disconnect();
    }, FALLBACK_DELAY_MS);

    return () => {
      clearTimeout(fallback);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [ref, inView];
}

export default useInView;
