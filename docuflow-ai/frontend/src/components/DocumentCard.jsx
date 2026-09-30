/**
 * Document card used in lists and dashboards.
 */
import { Link } from 'react-router-dom';
import StatusBadge from './StatusBadge.jsx';
import ConfidenceBadge from './ConfidenceBadge.jsx';
import { documentTypeLabel, formatRelative, fileExtension } from '../utils/format.js';

export default function DocumentCard({ document, onDelete, index = 0 }) {
  const isProcessing = document.status === 'processing';

  return (
    <div
      className="card df-lift df-enter"
      style={{ display: 'flex', flexDirection: 'column', '--i': index }}
    >
      <div className="card-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="row between">
          <span className="badge neutral">{fileExtension(document.fileName)}</span>
          <StatusBadge status={document.status} />
        </div>

        <div>
          <div className="cell-strong truncate" title={document.fileName}>
            {document.fileName}
          </div>
          <div className="cell-muted">
            {documentTypeLabel(document.documentType)} · {formatRelative(document.createdAt)}
          </div>
        </div>

        {isProcessing ? (
          <div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${document.progress || 0}%` }} />
            </div>
            <div className="progress-meta">
              <span className="truncate">{document.stageMessage || 'Processing...'}</span>
              <span>{document.progress || 0}%</span>
            </div>
          </div>
        ) : (
          <div className="row between">
            <span className="tiny subtle">Confidence</span>
            <ConfidenceBadge confidence={document.classificationConfidence} />
          </div>
        )}

        <div className="row between" style={{ marginTop: 'auto' }}>
          <Link to={`/documents/${document.id}`} className="btn sm">
            Open
          </Link>
          {onDelete ? (
            <button
              className="btn ghost sm"
              onClick={() => onDelete(document)}
              title="Delete document"
            >
              Delete
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
