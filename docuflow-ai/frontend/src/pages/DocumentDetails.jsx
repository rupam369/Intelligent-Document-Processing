/**
 * Document details page.
 *
 * LEFT  : original document preview / OCR text
 * RIGHT : document type, confidence, extracted fields, validation, status
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../services/api.js';
import DocumentPreview from '../components/DocumentPreview.jsx';
import ProcessingStatus from '../components/ProcessingStatus.jsx';
import ExtractedDataTable from '../components/ExtractedDataTable.jsx';
import ValidationResult from '../components/ValidationResult.jsx';
import ChatBox from '../components/ChatBox.jsx';
import ExportButtons from '../components/ExportButtons.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import ConfidenceBadge from '../components/ConfidenceBadge.jsx';
import { Loading, ErrorState } from '../components/States.jsx';
import useToast from '../components/Toast.jsx';
import { documentTypeLabel, formatDate, formatRelative, formatBytes } from '../utils/format.js';

const TABS = [
  { key: 'details', label: 'Details' },
  { key: 'extracted', label: 'Extracted data' },
  { key: 'validation', label: 'Validation' },
  { key: 'chat', label: 'AI chat' },
  { key: 'export', label: 'Export' },
  { key: 'logs', label: 'Processing log' },
];

export default function DocumentDetails({ onDocumentsChanged }) {
  const { id } = useParams();
  const toast = useToast();

  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('details');
  const [reprocessing, setReprocessing] = useState(false);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getDocument(id);
      setPayload(result);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while the document is still processing.
  useEffect(() => {
    const status = payload?.document?.status;
    if (status !== 'processing') return undefined;

    pollRef.current = setInterval(async () => {
      try {
        const result = await api.getDocument(id);
        setPayload(result);
        if (result.document.status !== 'processing') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          onDocumentsChanged?.();
        }
      } catch {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 1200);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [payload?.document?.status, id, onDocumentsChanged]);

  async function handleReprocess() {
    setReprocessing(true);
    try {
      await api.processDocument(id);
      toast.success('Reprocessing started', 'The pipeline is running again.');
      await load();
      onDocumentsChanged?.();
    } catch (processError) {
      toast.error('Reprocessing failed', processError.message);
    } finally {
      setReprocessing(false);
    }
  }

  if (loading) return <Loading label="Loading document..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!payload) return null;

  const { document, fields, validationResults, processingLogs, pipeline, schema } = payload;
  const currency = fields?.currency?.value || 'INR';
  const isProcessing = document.status === 'processing';

  return (
    <div className="stack lg">
      <div className="page-header">
        <div>
          <Link to="/documents" className="small muted">
            ← All documents
          </Link>
          <h1 className="truncate" style={{ maxWidth: 640, marginTop: 4 }} title={document.fileName}>
            {document.fileName}
          </h1>
          <p>
            {documentTypeLabel(document.documentType)} · {formatBytes(document.fileSize)} · uploaded{' '}
            {formatRelative(document.createdAt)}
          </p>
        </div>
        <div className="page-actions">
          <StatusBadge status={document.status} />
          <button className="btn" onClick={handleReprocess} disabled={reprocessing || isProcessing}>
            {reprocessing ? <span className="spinner dark" /> : null}
            Reprocess
          </button>
          <button
            className="btn"
            onClick={async () => {
              if (!window.confirm(`Delete "${document.fileName}"?`)) return;
              try {
                await api.deleteDocument(document.id);
                toast.success('Document deleted');
                window.location.assign('/documents');
              } catch (deleteError) {
                toast.error('Delete failed', deleteError.message);
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>

      {document.demoMode ? (
        <div className="demo-banner">
          <span className="demo-pill">DEMO MODE</span>
          <span>
            <strong>This document was read with the demo engine.</strong> {document.ocrMeta?.note || 'Representative content was used because no OCR provider is configured.'}
          </span>
        </div>
      ) : null}

      {isProcessing ? (
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Processing pipeline</h3>
              <p>{document.stageMessage || 'Working through the stages...'}</p>
            </div>
          </div>
          <div className="card-body">
            <ProcessingStatus
              pipeline={pipeline}
              status={document.status}
              progress={document.progress}
              currentStage={document.currentStage}
              completedStages={processingLogs?.filter((log) => log.status === 'completed').map((log) => log.stage)}
            />
          </div>
        </div>
      ) : null}

      {document.status === 'error' ? (
        <div className="alert danger">
          <span className="alert-icon">!</span>
          <div className="alert-body">
            <div className="alert-title">Processing failed</div>
            <div className="alert-text">
              {document.errorMessage || 'The document could not be processed.'} You can retry with the
              Reprocess button.
            </div>
          </div>
        </div>
      ) : null}

      {document.statusReason && !isProcessing ? (
        <div className={`alert ${document.status === 'verified' ? 'success' : document.status === 'error' ? 'danger' : 'warning'}`}>
          <span className="alert-icon">{document.status === 'verified' ? '✓' : '!'}</span>
          <div className="alert-body">
            <div className="alert-title">{document.status.replace(/_/g, ' ')}</div>
            <div className="alert-text">{document.statusReason}</div>
          </div>
        </div>
      ) : null}

      <div className="detail-grid">
        {/* LEFT: original document */}
        <div className="detail-stack">
          <DocumentPreview document={document} />
        </div>

        {/* RIGHT: everything the pipeline learned */}
        <div className="detail-stack">
          <div className="card">
            <div className="card-header">
              <div>
                <h3>Document overview</h3>
                <p>Classification and confidence</p>
              </div>
              <StatusBadge status={document.status} />
            </div>
            <div className="card-body">
              <div className="kv-list">
                <div className="kv-row">
                  <span className="kv-key">Document type</span>
                  <span className="kv-value">{documentTypeLabel(document.documentType)}</span>
                </div>
                <div className="kv-row">
                  <span className="kv-key">Confidence</span>
                  <span className="kv-value">
                    <ConfidenceBadge confidence={document.classificationConfidence} showLabel />
                  </span>
                </div>
                <div className="kv-row">
                  <span className="kv-key">Status</span>
                  <span className="kv-value" style={{ textTransform: 'capitalize' }}>
                    {document.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="kv-row">
                  <span className="kv-key">Pages</span>
                  <span className="kv-value">{document.pageCount ?? '--'}</span>
                </div>
                <div className="kv-row">
                  <span className="kv-key">Processed</span>
                  <span className="kv-value">{formatDate(document.processedAt, true)}</span>
                </div>
                <div className="kv-row">
                  <span className="kv-key">OCR engine</span>
                  <span className="kv-value tiny" style={{ fontWeight: 500 }}>
                    {document.ocrProvider || '--'}
                  </span>
                </div>
              </div>

              {document.alternatives?.length ? (
                <>
                  <div className="divider" />
                  <div className="tiny subtle" style={{ marginBottom: 6 }}>
                    Other possible types
                  </div>
                  <div className="row wrap" style={{ gap: 6 }}>
                    {document.alternatives.map((alternative) => (
                      <span key={alternative.document_type} className="badge neutral">
                        {documentTypeLabel(alternative.document_type)} ·{' '}
                        {Math.round((alternative.confidence || 0) * 100)}%
                      </span>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <h3>Extracted information</h3>
                <p>Every field carries its own confidence score</p>
              </div>
              <button className="btn ghost sm" onClick={() => setTab('extracted')}>
                Expand
              </button>
            </div>
            <div className="card-body tight">
              <ExtractedDataTable fields={fields} schema={schema} currency={currency} />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <h3>Validation</h3>
                <p>Automated checks on the extracted values</p>
              </div>
            </div>
            <div className="card-body">
              <ValidationResult results={validationResults} summary={document.validationSummary} />
            </div>
          </div>

          {document.missingFields?.length ? (
            <div className="alert warning">
              <span className="alert-icon">!</span>
              <div className="alert-body">
                <div className="alert-title">Missing information</div>
                <div className="alert-text">
                  These required fields were not found: {document.missingFields.join(', ')}.
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Tabs for chat / export / logs */}
      <div className="tabs">
        {TABS.map((item) => (
          <button
            key={item.key}
            className={`tab ${tab === item.key ? 'active' : ''}`}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'details' ? (
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Field detail</h3>
              <p>Full extracted dataset with confidence scores</p>
            </div>
          </div>
          <div className="card-body tight">
            <ExtractedDataTable fields={fields} schema={schema} currency={currency} />
          </div>
        </div>
      ) : null}

      {tab === 'extracted' ? (
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Extracted data</h3>
              <p>{Object.keys(fields || {}).length} fields extracted</p>
            </div>
          </div>
          <div className="card-body tight">
            <ExtractedDataTable fields={fields} schema={schema} currency={currency} />
          </div>
        </div>
      ) : null}

      {tab === 'validation' ? (
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Validation results</h3>
              <p>Rule-by-rule outcome for this document type</p>
            </div>
          </div>
          <div className="card-body">
            <ValidationResult results={validationResults} summary={document.validationSummary} />
          </div>
        </div>
      ) : null}

      {tab === 'chat' ? (
        <div className="card">
          <div className="card-header">
            <div>
              <h3>AI document chat</h3>
              <p>Answers come only from this document's extracted data and OCR text</p>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <ChatBox documentId={document.id} documentType={document.documentType} disabled={isProcessing} />
          </div>
        </div>
      ) : null}

      {tab === 'export' ? (
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Export</h3>
              <p>Structured JSON, tabular CSV or a full PDF report</p>
            </div>
          </div>
          <div className="card-body stack md">
            <ExportButtons documentId={document.id} fileName={document.fileName} />
            <div className="divider" />
            <ul className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
              <li>
                <strong>JSON</strong> - the complete structured payload: classification, fields with
                confidence, validation and review history.
              </li>
              <li>
                <strong>CSV</strong> - one row per extracted field plus validation outcomes, ready for a
                spreadsheet.
              </li>
              <li>
                <strong>PDF report</strong> - a formatted report covering document information,
                classification, extracted data, validation results, confidence information and review status.
              </li>
            </ul>
          </div>
        </div>
      ) : null}

      {tab === 'logs' ? (
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Processing log</h3>
              <p>Every stage the pipeline ran for this document</p>
            </div>
          </div>
          <div className="card-body tight">
            {processingLogs?.length ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Stage</th>
                      <th>Status</th>
                      <th>Progress</th>
                      <th>Message</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processingLogs.map((log, index) => (
                      <tr key={`${log.stage}-${index}`}>
                        <td className="cell-strong">{log.stage}</td>
                        <td>
                          <span className={`badge ${log.status === 'completed' ? 'success' : log.status === 'failed' ? 'danger' : 'info'}`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="cell-muted">{log.progress}%</td>
                        <td className="cell-muted">{log.message}</td>
                        <td className="cell-muted nowrap">
                          {log.durationMs ? `${log.durationMs} ms` : '--'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">◌</div>
                <h3>No log entries</h3>
                <p>Processing logs appear once the pipeline runs.</p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
