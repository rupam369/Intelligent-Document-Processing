/**
 * Upload page - drag & drop plus the live processing pipeline.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import UploadBox from '../components/UploadBox.jsx';
import ProcessingStatus from '../components/ProcessingStatus.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import ConfidenceBadge from '../components/ConfidenceBadge.jsx';
import { Loading, ErrorState, DemoModeBanner } from '../components/States.jsx';
import { documentTypeLabel, formatRelative } from '../utils/format.js';

const DEFAULT_PIPELINE = [
  { key: 'upload', label: 'Uploading', progress: 10 },
  { key: 'ocr', label: 'OCR Processing', progress: 25 },
  { key: 'classification', label: 'Classifying', progress: 40 },
  { key: 'extraction', label: 'Extracting Data', progress: 60 },
  { key: 'validation', label: 'Validating', progress: 80 },
  { key: 'scoring', label: 'Confidence Scoring', progress: 95 },
  { key: 'complete', label: 'Completed', progress: 100 },
];

export default function Upload({ onUploaded }) {
  const navigate = useNavigate();
  const [active, setActive] = useState(null);
  const [pipeline, setPipeline] = useState(DEFAULT_PIPELINE);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);
  const [capabilities, setCapabilities] = useState(null);

  useEffect(() => {
    api.capabilities().then(setCapabilities).catch(() => {});
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (documentId) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const payload = await api.documentStatus(documentId);
          setStatus(payload);
          if (payload.pipeline?.length) setPipeline(payload.pipeline);
          if (payload.status !== 'processing') {
            stopPolling();
            onUploaded?.();
          }
        } catch (pollError) {
          setError(pollError.message);
          stopPolling();
        }
      }, 900);
    },
    [onUploaded, stopPolling],
  );

  useEffect(() => stopPolling, [stopPolling]);

  function handleUploaded(payload) {
    setError(null);
    setActive(payload.document);
    setStatus({
      id: payload.document.id,
      status: payload.document.status,
      progress: payload.document.progress,
      currentStage: payload.document.currentStage,
      completedStages: [],
    });
    if (payload.pipeline?.length) setPipeline(payload.pipeline);
    startPolling(payload.document.id);
  }

  const isFinished = status && status.status !== 'processing';
  const failed = status?.status === 'error';

  return (
    <div className="stack lg">
      <div className="page-header">
        <div>
          <h1>Upload a document</h1>
          <p>
            PDF, JPG and PNG. The file is stored securely, then read, classified, extracted, validated and
            scored automatically.
          </p>
        </div>
      </div>

      <DemoModeBanner capabilities={capabilities} />

      <div className="detail-grid">
        <div className="stack md">
          <UploadBox onUploaded={handleUploaded} />

          <div className="card">
            <div className="card-header">
              <div>
                <h3>What happens next</h3>
                <p>The pipeline runs in this order</p>
              </div>
            </div>
            <div className="card-body">
              <ol className="small muted" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
                <li>The file is stored in document storage and a record is created.</li>
                <li>OCR / vision extracts the text and layout.</li>
                <li>AI classification decides the document type with a confidence score.</li>
                <li>Structured fields are extracted, each with its own confidence.</li>
                <li>The validation engine checks totals, dates and required fields.</li>
                <li>Documents with issues are routed to human review.</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="stack md">
          {active ? (
            <div className="card">
              <div className="card-header">
                <div>
                  <h3 className="truncate" style={{ maxWidth: 240 }}>
                    {active.fileName}
                  </h3>
                  <p>
                    {documentTypeLabel(active.documentType)} · {formatRelative(active.createdAt)}
                  </p>
                </div>
                <StatusBadge status={status?.status || active.status} />
              </div>
              <div className="card-body">
                <ProcessingStatus
                  pipeline={pipeline}
                  status={status?.status}
                  progress={status?.progress}
                  currentStage={status?.currentStage}
                  completedStages={status?.completedStages}
                  error={status?.errorMessage}
                />
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-header">
                <div>
                  <h3>Processing status</h3>
                  <p>Live progress appears here once you upload</p>
                </div>
              </div>
              <div className="card-body">
                <ProcessingStatus pipeline={pipeline} status="idle" progress={0} />
              </div>
            </div>
          )}

          {isFinished ? (
            <div className={`alert ${failed ? 'danger' : 'success'}`}>
              <span className="alert-icon">{failed ? '!' : '✓'}</span>
              <div className="alert-body">
                <div className="alert-title">
                  {failed ? 'Processing failed' : 'Processing complete'}
                </div>
                <div className="alert-text">
                  {failed
                    ? status?.errorMessage || 'The document could not be processed. You can retry from the document page.'
                    : `"${active.fileName}" was classified as a ${documentTypeLabel(active.documentType).toLowerCase()}.`}
                </div>
                {!failed ? (
                  <div className="row" style={{ marginTop: 10, gap: 8 }}>
                    <Link to={`/documents/${active.id}`} className="btn primary sm">
                      Open document
                    </Link>
                    <button className="btn sm" onClick={() => { setActive(null); setStatus(null); }}>
                      Upload another
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {error ? <ErrorState message={error} /> : null}
        </div>
      </div>
    </div>
  );
}
