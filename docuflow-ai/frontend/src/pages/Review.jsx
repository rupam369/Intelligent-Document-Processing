/**
 * Human review page.
 *
 * Shows documents that need a decision, side by side with their extracted data,
 * confidence scores and validation warnings. A reviewer can edit, approve or
 * reject individual fields and then approve the document or flag it.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { Loading, ErrorState, EmptyState } from '../components/States.jsx';
import DocumentPreview from '../components/DocumentPreview.jsx';
import ExtractedDataTable from '../components/ExtractedDataTable.jsx';
import ValidationResult from '../components/ValidationResult.jsx';
import ConfidenceBadge from '../components/ConfidenceBadge.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Modal from '../components/Modal.jsx';
import useToast from '../components/Toast.jsx';
import { documentTypeLabel, formatRelative, humanise, formatFieldValue } from '../utils/format.js';

export default function Review({ onReviewed }) {
  const toast = useToast();
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [addField, setAddField] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await api.reviewQueue();
      setQueue(payload.items);
      if (!selectedId && payload.items.length) setSelectedId(payload.items[0].document.id);
    } catch (queueError) {
      setError(queueError.message);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDetail = useCallback(async (id) => {
    setDetailLoading(true);
    try {
      const payload = await api.getDocument(id);
      setDetail(payload);
    } catch (detailError) {
      toast.error('Could not load the document', detailError.message);
    } finally {
      setDetailLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function act(action, extra = {}) {
    if (!selectedId) return;
    setBusy(true);
    try {
      const payload = await api.submitReview(selectedId, { action, ...extra });
      setDetail((current) => (current ? { ...current, fields: payload.fields } : current));
      toast.success('Review recorded', describeAction(action, extra));
      await load();
      onReviewed?.();
    } catch (reviewError) {
      toast.error('Review action failed', reviewError.message);
    } finally {
      setBusy(false);
    }
  }

  function describeAction(action, extra = {}) {
    switch (action) {
      case 'approve_field':
        return `"${humanise(extra.field)}" approved.`;
      case 'reject_field':
        return `"${humanise(extra.field)}" rejected.`;
      case 'edit_field':
        return `"${humanise(extra.field)}" updated.`;
      case 'add_field':
        return `"${humanise(extra.field)}" added.`;
      case 'approve_document':
        return 'Document approved and marked verified.';
      case 'needs_attention':
        return 'Document flagged as needing attention.';
      default:
        return 'Action recorded.';
    }
  }

  if (loading) return <Loading label="Loading the review queue..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  if (!queue.length) {
    return (
      <div className="stack lg">
        <div className="page-header">
          <div>
            <h1>Human review</h1>
            <p>Documents that need a human decision appear here.</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <EmptyState
              icon="✓"
              title="Nothing to review"
              text="Every document has passed its checks. New documents will appear here automatically when confidence is low, a field is missing or validation finds a discrepancy."
              action={
                <Link to="/upload" className="btn primary">
                  Upload a document
                </Link>
              }
            />
          </div>
        </div>
      </div>
    );
  }

  const current = detail?.document;
  const fields = detail?.fields || {};
  const currency = fields.currency?.value || 'INR';

  return (
    <div className="stack lg">
      <div className="page-header">
        <div>
          <h1>Human review</h1>
          <p>
            {queue.length} document{queue.length === 1 ? '' : 's'} waiting. Review the original alongside the
            extracted data, then approve or flag.
          </p>
        </div>
      </div>

      <div className="detail-grid">
        {/* Queue */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Review queue</h3>
              <p>Select a document to review</p>
            </div>
          </div>
          <div className="card-body tight">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((item) => (
                    <tr
                      key={item.document.id}
                      style={{
                        background: item.document.id === selectedId ? 'var(--brand-soft)' : undefined,
                        cursor: 'pointer',
                      }}
                      onClick={() => setSelectedId(item.document.id)}
                    >
                      <td>
                        <div className="cell-strong truncate" style={{ maxWidth: 200 }}>
                          {item.document.fileName}
                        </div>
                        <div className="cell-muted">
                          {documentTypeLabel(item.document.documentType)} · {formatRelative(item.document.createdAt)}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={item.document.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Reviewer workspace */}
        <div className="detail-stack">
          {detailLoading || !current ? (
            <div className="card">
              <div className="card-body">
                <Loading label="Loading document..." />
              </div>
            </div>
          ) : (
            <>
              <div className="card">
                <div className="card-header">
                  <div>
                    <h3 className="truncate" style={{ maxWidth: 260 }}>
                      {current.fileName}
                    </h3>
                    <p>
                      {documentTypeLabel(current.documentType)} · confidence{' '}
                      {Math.round((current.classificationConfidence || 0) * 100)}%
                    </p>
                  </div>
                  <StatusBadge status={current.status} />
                </div>
                <div className="card-body">
                  {current.statusReason ? (
                    <div className="alert warning" style={{ marginBottom: 14 }}>
                      <span className="alert-icon">!</span>
                      <div className="alert-body">
                        <div className="alert-title">Why this needs review</div>
                        <div className="alert-text">{current.statusReason}</div>
                      </div>
                    </div>
                  ) : null}

                  <ValidationResult
                    results={detail.validationResults}
                    summary={current.validationSummary}
                  />
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <div>
                    <h3>Extracted data</h3>
                    <p>Edit, approve or reject each field</p>
                  </div>
                  <button className="btn ghost sm" onClick={() => setAddField({ name: '', value: '' })}>
                    Add field
                  </button>
                </div>
                <div className="card-body tight">
                  <ExtractedDataTable
                    fields={fields}
                    schema={detail.schema}
                    currency={currency}
                    editable
                    onEdit={(name, entry) => {
                      setEditing(name);
                      setEditValue(typeof entry.value === 'object' ? JSON.stringify(entry.value) : String(entry.value ?? ''));
                    }}
                  />
                </div>
                <div className="card-body" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="btn-row">
                    <button className="btn success" disabled={busy} onClick={() => act('approve_document')}>
                      Approve document
                    </button>
                    <button className="btn" disabled={busy} onClick={() => act('needs_attention')}>
                      Needs attention
                    </button>
                    <Link to={`/documents/${current.id}`} className="btn ghost">
                      Open full page
                    </Link>
                  </div>
                </div>
              </div>

              <DocumentPreview document={current} />
            </>
          )}
        </div>
      </div>

      {editing ? (
        <Modal
          title={`Edit “${humanise(editing)}”`}
          subtitle="Correct the extracted value. Approved edits are stored with full confidence."
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={busy}
                onClick={async () => {
                  await act('edit_field', { field: editing, value: editValue });
                  setEditing(null);
                }}
              >
                Save value
              </button>
            </>
          }
        >
          <div className="stack md">
            <div className="field">
              <label>Current value</label>
              <div className="small muted">{formatFieldValue(editing, fields[editing], currency)}</div>
            </div>
            <div className="field">
              <label htmlFor="edit-value">New value</label>
              <input
                id="edit-value"
                value={editValue}
                onChange={(event) => setEditValue(event.target.value)}
                autoFocus
              />
            </div>
            <div className="btn-row">
              <button
                className="btn"
                disabled={busy}
                onClick={async () => {
                  await act('approve_field', { field: editing });
                  setEditing(null);
                }}
              >
                Approve as-is
              </button>
              <button
                className="btn"
                disabled={busy}
                onClick={async () => {
                  await act('reject_field', { field: editing });
                  setEditing(null);
                }}
              >
                Reject field
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {addField ? (
        <Modal
          title="Add missing information"
          subtitle="Supply a required field that the document did not yield."
          onClose={() => setAddField(null)}
          footer={
            <>
              <button className="btn" onClick={() => setAddField(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={busy || !addField.name.trim() || !String(addField.value).trim()}
                onClick={async () => {
                  await act('add_field', { field: addField.name.trim(), value: addField.value });
                  setAddField(null);
                }}
              >
                Add field
              </button>
            </>
          }
        >
          <div className="field">
            <label htmlFor="new-field-name">Field name</label>
            <input
              id="new-field-name"
              value={addField.name}
              onChange={(event) => setAddField({ ...addField, name: event.target.value })}
              placeholder="e.g. po_number"
            />
          </div>
          <div className="field">
            <label htmlFor="new-field-value">Value</label>
            <input
              id="new-field-value"
              value={addField.value}
              onChange={(event) => setAddField({ ...addField, value: event.target.value })}
              placeholder="e.g. PO-2026-118"
            />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
