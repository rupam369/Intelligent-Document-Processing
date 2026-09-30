/**
 * Confidence badge.
 *
 * 90-100%  high confidence
 * 70-89%   medium confidence
 * below 70% needs review
 *
 * Scores are presented as an indication, never as a guarantee.
 */
import { confidenceBand, formatPercent, BAND_LABELS } from '../utils/format.js';

export default function ConfidenceBadge({ confidence, showLabel = false, compact = false }) {
  const band = confidenceBand(confidence);
  const percent = formatPercent(confidence);

  return (
    <span className="confidence" title={`${BAND_LABELS[band]} - ${percent}. Confidence scores are indicative, not a guarantee.`}>
      <span className="confidence-track">
        <span
          className={`confidence-fill ${band}`}
          style={{ width: confidence === null || confidence === undefined ? '0%' : `${Math.max(4, Number(confidence) * 100)}%` }}
        />
      </span>
      <span className={`confidence-value ${band}`}>{percent}</span>
      {showLabel ? <span className="tiny subtle">{BAND_LABELS[band]}</span> : null}
      {!compact && band === 'low' ? <span className="field-flag">needs review</span> : null}
    </span>
  );
}
