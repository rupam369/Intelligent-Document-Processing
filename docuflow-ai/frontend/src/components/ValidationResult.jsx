/**
 * Validation results list.
 *
 * Uses deliberately neutral wording - the engine reports discrepancies, it
 * never accuses a document of being fraudulent.
 */
const ICONS = { pass: '✓', fail: '!', warning: '!', skipped: '–' };
const HEADINGS = {
  pass: 'Check passed',
  fail: 'Discrepancy detected',
  warning: 'Needs a quick look',
  skipped: 'Not applicable',
};

export default function ValidationResult({ results, summary }) {
  if (!results?.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon">✓</div>
        <h3>No validation rules ran</h3>
        <p>Validation rules run automatically once extraction completes for this document type.</p>
      </div>
    );
  }

  return (
    <div className="stack md">
      {summary ? (
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="badge success">{summary.passed ?? 0} passed</span>
          {summary.failed ? <span className="badge danger">{summary.failed} failed</span> : null}
          {summary.warnings ? <span className="badge warning">{summary.warnings} to check</span> : null}
          {summary.skipped ? <span className="badge neutral">{summary.skipped} not applicable</span> : null}
        </div>
      ) : null}

      <div className="validation-list">
        {results.map((result, index) => (
          <div
            key={`${result.rule_name}-${index}`}
            className={`validation-item ${result.status}`}
            style={{ '--i': index }}
          >
            <span className={`validation-icon ${result.status}`}>{ICONS[result.status] || '·'}</span>
            <div className="validation-body">
              <div className="validation-title">
                {result.label || result.rule_name}
                <span className="tiny subtle" style={{ marginLeft: 8, fontWeight: 500 }}>
                  {HEADINGS[result.status] || result.status}
                </span>
              </div>
              {result.message ? <div className="validation-message">{result.message}</div> : null}

              {result.expected_value || result.actual_value ? (
                <div className="validation-values">
                  {result.expected_value ? (
                    <span>
                      Expected: <strong>{result.expected_value}</strong>
                    </span>
                  ) : null}
                  {result.actual_value ? (
                    <span>
                      In document: <strong>{result.actual_value}</strong>
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <p className="tiny subtle">
        Validation reports possible discrepancies for a human to confirm. It does not determine fraud.
      </p>
    </div>
  );
}
