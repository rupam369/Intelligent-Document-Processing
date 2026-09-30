/**
 * Document preview pane.
 *
 * Shows the original document (image or PDF) plus a toggle to inspect the raw
 * OCR text that the pipeline actually read.
 */
import { useState } from 'react';
import { api } from '../services/api.js';
import { fileExtension, formatBytes } from '../utils/format.js';

export default function DocumentPreview({ document }) {
  const [view, setView] = useState('document');
  const extension = fileExtension(document.fileName);
  const isImage = ['JPG', 'JPEG', 'PNG'].includes(extension);
  // Prefer the backend-provided URL (a signed Supabase URL in production),
  // falling back to the authenticated proxy route.
  const fileUrl = document.fileUrl || api.fileUrl(document.id, document.filePath);

  return (
    <div className="preview-pane">
      <div className="preview-toolbar">
        <div className="row" style={{ gap: 6 }}>
          <button className={`btn ghost sm ${view === 'document' ? 'active' : ''}`} onClick={() => setView('document')}>
            Original
          </button>
          <button className={`btn ghost sm ${view === 'ocr' ? 'active' : ''}`} onClick={() => setView('ocr')}>
            OCR text
          </button>
        </div>
        <span className="tiny subtle">
          {extension} · {formatBytes(document.fileSize)}
          {document.pageCount ? ` · ${document.pageCount} page${document.pageCount === 1 ? '' : 's'}` : ''}
        </span>
      </div>

      {view === 'document' ? (
        <div className="preview-frame">
          {isImage ? (
            <img src={fileUrl} alt={document.fileName} />
          ) : (
            <iframe src={fileUrl} title={document.fileName} />
          )}
        </div>
      ) : (
        <div style={{ padding: 14 }}>
          {document.ocrText ? (
            <pre className="ocr-text">{document.ocrText}</pre>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">⌬</div>
              <h3>No OCR text stored</h3>
              <p>OCR text is captured when the document is processed.</p>
            </div>
          )}
          {document.ocrMeta?.note ? (
            <div className="alert warning" style={{ marginTop: 12 }}>
              <span className="alert-icon">!</span>
              <div className="alert-body">
                <div className="alert-text">{document.ocrMeta.note}</div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
