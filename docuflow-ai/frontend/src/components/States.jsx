/**
 * Shared loading / error / empty state components.
 */
import AnimatedNumber from './AnimatedNumber.jsx';

export function Loading({ label = 'Loading...', rows = 0 }) {
  if (rows > 0) {
    return (
      <div>
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="skeleton skeleton-row"
            style={{ width: index % 3 === 2 ? '62%' : '100%' }}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="row" style={{ gap: 9, color: 'var(--text-muted)', fontSize: 13 }}>
      <span className="spinner dark" />
      {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="alert danger">
      <span className="alert-icon">!</span>
      <div className="alert-body">
        <div className="alert-title">Something went wrong</div>
        <div className="alert-text">{message}</div>
      </div>
      {onRetry ? (
        <button className="btn sm" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ icon = '◌', title, text, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {text ? <p>{text}</p> : null}
      {action ? <div style={{ marginTop: 16 }}>{action}</div> : null}
    </div>
  );
}

export function StatCard({ label, value, hint, icon, tone = 'brand', index = 0 }) {
  const numeric = typeof value === 'number' && Number.isFinite(value);

  return (
    <div
      className="stat-card df-enter"
      style={{ '--i': index }}
    >
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className={`stat-icon ${tone}`}>{icon}</span>
      </div>
      <span className="stat-value">
        {numeric ? <AnimatedNumber value={value} /> : value}
      </span>
      {hint ? <span className="stat-hint">{hint}</span> : null}
    </div>
  );
}

export function DemoModeBanner({ capabilities }) {
  if (!capabilities?.demoMode) return null;

  const reasons = [];
  if (capabilities.database?.demoMode) reasons.push('database (local file store)');
  if (capabilities.ai?.demoMode) reasons.push('AI engine (heuristic)');
  if (capabilities.ocr?.demoMode) reasons.push('OCR (bundled demo corpus)');
  if (capabilities.auth?.demoMode) reasons.push('authentication (local accounts)');

  return (
    <div className="demo-banner">
      <span className="demo-pill">DEMO MODE</span>
      <span>
        <strong>Demo mode is active.</strong> {reasons.length ? `Using ${reasons.join(', ')}.` : ''} Add your
        Supabase and AI/OCR keys in <code>.env</code> to switch to production engines.
      </span>
    </div>
  );
}

export default { Loading, ErrorState, EmptyState, StatCard, DemoModeBanner };
