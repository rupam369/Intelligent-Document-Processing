/**
 * Processing status - renders the pipeline stages with live progress.
 *
 * Uploading...        10%
 * OCR Processing...   25%
 * Classifying...      40%
 * Extracting Data...  60%
 * Validating...       80%
 * Completed...        100%
 */
import ConfidenceBadge from './ConfidenceBadge.jsx';

const STAGE_ICONS = {
  upload: '↑',
  ocr: '⌬',
  classification: '◫',
  extraction: '⛁',
  validation: '✓',
  scoring: '◔',
  complete: '★',
  error: '!',
};

export default function ProcessingStatus({ pipeline, status, progress, currentStage, completedStages = [], error }) {
  const stages = pipeline || [];
  const done = new Set(completedStages);
  const failed = status === 'error';
  const isIdle = !status || status === 'idle';

  const badge = failed ? (
    <span className="badge danger">
      <span className="badge-dot" />
      Error
    </span>
  ) : isIdle ? (
    <span className="badge neutral">
      <span className="badge-dot" />
      Waiting
    </span>
  ) : status === 'processing' ? (
    <span className="badge info">
      <span className="badge-dot" />
      Processing
    </span>
  ) : (
    <span className="badge success">
      <span className="badge-dot" />
      Completed
    </span>
  );

  return (
    <div className="stack md">
      <div className="row between wrap">
        <div className="row">
          {badge}
          <span className="small muted">{progress ?? 0}% complete</span>
        </div>
        {!isIdle && status !== 'processing' && !failed ? <span className="small muted">Finished</span> : null}
      </div>

      <div className="progress-track">
        <div
          className={`progress-fill ${failed ? 'danger' : progress >= 100 ? 'success' : ''}`}
          style={{ width: `${progress ?? 0}%` }}
        />
      </div>

      <div className="pipeline">
        {stages.map((stage) => {
          const isDone = done.has(stage.key) || (progress ?? 0) >= stage.progress;
          const isActive = currentStage === stage.key && status === 'processing';
          const isFailed = failed && isActive;

          let className = 'pipeline-stage';
          if (isFailed) className += ' failed';
          else if (isActive) className += ' active';
          else if (isDone) className += ' done';
          else className += ' pending';

          return (
            <div key={stage.key} className={className}>
              <span className="pipeline-marker">
                {isFailed ? '!' : isDone ? '✓' : STAGE_ICONS[stage.key] || '·'}
              </span>
              <span className="pipeline-stage-label">
                {isActive || isFailed ? `${stage.label}...` : stage.label}
              </span>
              <span className="pipeline-stage-pct">{stage.progress}%</span>
            </div>
          );
        })}
      </div>

      {error ? (
        <div className="alert danger">
          <span className="alert-icon">!</span>
          <div className="alert-body">
            <div className="alert-title">Processing failed</div>
            <div className="alert-text">{error}</div>
          </div>
        </div>
      ) : null}

      <div className="row between small muted">
        <span>Stage</span>
        <span className="bold">{currentStage || 'waiting'}</span>
      </div>
    </div>
  );
}
