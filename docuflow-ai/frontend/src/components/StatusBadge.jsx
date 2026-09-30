/**
 * Status badge - shared by every list and detail view.
 */
import { STATUS_LABELS, STATUS_TONE } from '../utils/format.js';

export default function StatusBadge({ status, size = 'md' }) {
  const tone = STATUS_TONE[status] || 'neutral';
  const label = STATUS_LABELS[status] || status;

  return (
    <span className={`badge ${tone}`} title={label}>
      <span className="badge-dot" />
      {label}
    </span>
  );
}
