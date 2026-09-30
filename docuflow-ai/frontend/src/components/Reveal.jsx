/**
 * Reveal - fades / slides its children in when they scroll into view.
 *
 * `index` staggers siblings so lists cascade instead of popping in together.
 * `variant` picks the direction of travel.
 */
import { useInView } from '../hooks/useInView.js';

const VARIANTS = {
  up: '',
  left: 'from-left',
  right: 'from-right',
  scale: 'from-scale',
};

export default function Reveal({
  children,
  as: Tag = 'div',
  index = 0,
  variant = 'up',
  className = '',
  style,
  ...rest
}) {
  const [ref, inView] = useInView();

  return (
    <Tag
      ref={ref}
      className={`df-reveal ${VARIANTS[variant] || ''} ${inView ? 'is-visible' : ''} ${className}`.trim()}
      style={{ '--i': index, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
