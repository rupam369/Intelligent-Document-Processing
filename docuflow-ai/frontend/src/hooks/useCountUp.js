/**
 * useCountUp - eases a number from 0 to its target for stat readouts.
 *
 * Uses requestAnimationFrame so it stays smooth, and snaps to the exact target
 * on the final frame (no rounding drift) or when rAF is unavailable.
 */
import { useEffect, useRef, useState } from 'react';

const DEFAULT_DURATION = 950;

export function useCountUp(target, { duration = DEFAULT_DURATION } = {}) {
  const [value, setValue] = useState(0);
  const frameRef = useRef(null);

  useEffect(() => {
    if (typeof target !== 'number' || Number.isNaN(target)) {
      setValue(0);
      return undefined;
    }

    if (typeof requestAnimationFrame === 'undefined') {
      setValue(target);
      return undefined;
    }

    const start = performance.now();

    const tick = (now) => {
      const elapsed = now - start;
      const progress = duration <= 0 ? 1 : Math.min(elapsed / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        setValue(target);
      }
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration]);

  return value;
}

export default useCountUp;
