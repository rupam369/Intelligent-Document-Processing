/**
 * Lightweight dependency-free charts (inline SVG).
 * Every chart animates itself in on mount.
 */
import { documentTypeLabel } from '../utils/format.js';

const PALETTE = ['#4f46e5', '#12b76a', '#f79009', '#f04438', '#0ba5ec', '#7c6cf6', '#98a2b3', '#d0d5dd'];

/** Donut chart for document-type distribution. */
export function DonutChart({ data, size = 148, thickness = 22 }) {
  const entries = Object.entries(data || {}).filter(([, value]) => value > 0);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);

  if (!total) {
    return (
      <div className="empty-state" style={{ padding: 24 }}>
        <p>No documents yet.</p>
      </div>
    );
  }

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="donut-wrap">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Document type distribution"
        style={{ animation: 'df-scale-in 700ms var(--ease-spring) both', flex: 'none' }}
      >
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {entries.map(([key, value], index) => {
            const fraction = value / total;
            const dash = fraction * circumference;
            const startOffset = offset;
            offset += dash;

            return (
              <circle
                key={key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={PALETTE[index % PALETTE.length]}
                strokeWidth={thickness}
                strokeDasharray={`${Math.max(dash - 2, 0)} ${circumference}`}
                strokeDashoffset={-startOffset}
                strokeLinecap="butt"
                style={{
                  '--dash-from': circumference,
                  '--dash-to': -startOffset,
                  animation: 'df-draw 950ms var(--ease-out) both',
                  animationDelay: `${index * 110}ms`,
                }}
              />
            );
          })}
        </g>
        <text
          x="50%"
          y="47%"
          textAnchor="middle"
          style={{
            fontSize: 24,
            fontWeight: 700,
            fill: 'var(--text)',
            animation: 'df-pop-in 600ms var(--ease-spring) both',
            animationDelay: '420ms',
          }}
        >
          {total}
        </text>
        <text
          x="50%"
          y="62%"
          textAnchor="middle"
          style={{
            fontSize: 11,
            fill: 'var(--text-subtle)',
            animation: 'df-fade-in 600ms var(--ease-out) both',
            animationDelay: '560ms',
          }}
        >
          documents
        </text>
      </svg>

      <div className="donut-legend">
        {entries.map(([key, value], index) => (
          <div key={key} className="legend-item" style={{ '--i': index }}>
            <span className="legend-swatch" style={{ background: PALETTE[index % PALETTE.length] }} />
            <span className="legend-label">{documentTypeLabel(key)}</span>
            <span className="legend-value">
              {value}
              <span className="subtle" style={{ fontWeight: 400 }}>
                {' '}
                ({Math.round((value / total) * 100)}%)
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Horizontal bar list. */
export function BarList({ data, colour = 'var(--brand)' }) {
  const entries = Object.entries(data || {}).filter(([, value]) => value > 0);
  const max = Math.max(...entries.map(([, value]) => value), 1);

  if (!entries.length) {
    return (
      <div className="empty-state" style={{ padding: 24 }}>
        <p>Nothing to show yet.</p>
      </div>
    );
  }

  return (
    <div className="bar-list">
      {entries.map(([key, value], index) => (
        <div key={key} className="bar-item" style={{ '--i': index }}>
          <div className="bar-head">
            <span>{documentTypeLabel(key)}</span>
            <strong>{value}</strong>
          </div>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{
                width: `${(value / max) * 100}%`,
                background: colour,
                '--i': index,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Vertical column chart for small counts. */
export function ColumnChart({ data, height = 130 }) {
  const entries = Object.entries(data || {}).filter(([, value]) => value > 0);
  const max = Math.max(...entries.map(([, value]) => value), 1);

  if (!entries.length) {
    return (
      <div className="empty-state" style={{ padding: 24 }}>
        <p>Nothing to show yet.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height, paddingTop: 8 }}>
      {entries.map(([key, value], index) => (
        <div
          key={key}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            animation: 'df-fade-up 600ms var(--ease-out) both',
            animationDelay: `${index * 90}ms`,
          }}
        >
          <span className="tiny bold">{value}</span>
          <div
            className="chart-column"
            style={{
              width: '100%',
              maxWidth: 46,
              height: `${Math.max((value / max) * (height - 40), 4)}px`,
              background: 'var(--brand-grad)',
              borderRadius: '6px 6px 0 0',
              transformOrigin: 'bottom center',
              animation: 'df-grow-y 780ms var(--ease-out) both',
              animationDelay: `${index * 90}ms`,
            }}
          />
          <span className="tiny subtle center" style={{ lineHeight: 1.2 }}>
            {key.replace(/_/g, ' ')}
          </span>
        </div>
      ))}
    </div>
  );
}

export default { DonutChart, BarList, ColumnChart };
