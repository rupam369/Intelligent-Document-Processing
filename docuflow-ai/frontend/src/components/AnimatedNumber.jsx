/**
 * AnimatedNumber - counts up to its value when it first renders.
 * Falls back to a plain number when the value is not numeric.
 */
import { useCountUp } from '../hooks/useCountUp.js';

export default function AnimatedNumber({ value, decimals = 0, duration, className }) {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : null;
  const animated = useCountUp(numeric === null ? 0 : numeric, { duration });

  if (numeric === null) return <span className={className}>{value ?? '—'}</span>;

  return <span className={className}>{animated.toFixed(decimals)}</span>;
}
