/**
 * Extracted data table.
 *
 * Shows every field with its value, confidence score and any review state.
 */
import ConfidenceBadge from './ConfidenceBadge.jsx';
import { formatFieldValue, humanise } from '../utils/format.js';

export default function ExtractedDataTable({
  fields,
  schema,
  currency = 'INR',
  reviewState = {},
  onEdit,
  editable = false,
}) {
  const entries = Object.entries(fields || {});

  if (!entries.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⛁</div>
        <h3>No data extracted yet</h3>
        <p>Once the document finishes processing, extracted fields will appear here with confidence scores.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th style={{ width: '26%' }}>Field</th>
            <th>Value</th>
            <th style={{ width: '20%' }}>Confidence</th>
            {editable ? <th style={{ width: '12%' }} /> : null}
          </tr>
        </thead>
        <tbody>
          {entries.map(([name, entry]) => {
            const review = reviewState[name] || {};
            const label = schema?.[name]?.label || humanise(name);
            const isMoney = entry?.unit === 'currency';

            return (
              <tr key={name}>
                <td>
                  <div className={`field-row ${review.rejected ? 'rejected' : ''}`}>
                    <div>
                      <div className="field-name">{label}</div>
                      <div className="field-label mono">{name}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="field-value">{formatFieldValue(name, entry, currency)}</div>
                  {entry?.note ? <span className="field-note">{entry.note}</span> : null}
                  {review.rejected ? <span className="field-flag">rejected by reviewer</span> : null}
                  {review.reviewed && !review.rejected ? (
                    <span className="field-flag" style={{ color: 'var(--success)' }}>
                      reviewed
                    </span>
                  ) : null}
                </td>
                <td>
                  <ConfidenceBadge confidence={entry?.confidence} showLabel={isMoney} />
                </td>
                {editable ? (
                  <td>
                    <button className="btn ghost sm" onClick={() => onEdit?.(name, entry)}>
                      Edit
                    </button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
