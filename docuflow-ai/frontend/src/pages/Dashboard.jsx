/**
 * Dashboard - overview of the workspace.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { StatCard, Loading, ErrorState, EmptyState } from '../components/States.jsx';
import { DonutChart, ColumnChart } from '../components/Charts.jsx';
import Reveal from '../components/Reveal.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import ConfidenceBadge from '../components/ConfidenceBadge.jsx';
import { documentTypeLabel, formatRelative } from '../utils/format.js';

export default function Dashboard({ onDocumentsChanged }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await api.stats();
      setStats(payload);
      onDocumentsChanged?.();
    } catch (statsError) {
      setError(statsError.message);
    } finally {
      setLoading(false);
    }
  }, [onDocumentsChanged]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Loading label="Loading your dashboard..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!stats) return null;

  const { totals, byType, byStatus, recent, averageConfidence } = stats;

  return (
    <div className="stack lg">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Everything your document pipeline has processed, at a glance.</p>
        </div>
        <div className="page-actions">
          <Link to="/upload" className="btn primary">
            Upload document
          </Link>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard index={0} label="Total documents" value={totals.documents} icon="▤" tone="brand" hint="All uploads in your workspace" />
        <StatCard index={1} label="Processed" value={totals.processed} icon="✓" tone="success" hint="Verified or reviewed" />
        <StatCard
          index={2}
          label="Needing review"
          value={totals.needsReview}
          icon="!"
          tone="warning"
          hint={totals.needsReview ? 'Waiting for a human decision' : 'Nothing pending'}
        />
        <StatCard
          index={3}
          label="With errors"
          value={totals.withErrors}
          icon="×"
          tone="danger"
          hint={totals.withErrors ? 'Processing failed' : 'No failures'}
        />
      </div>

      <div className="chart-grid">
        <Reveal index={0} className="card">
          <div className="card-header">
            <div>
              <h3>Document type distribution</h3>
              <p>How your uploaded documents break down by type</p>
            </div>
          </div>
          <div className="card-body">
            <DonutChart data={byType} />
          </div>
        </Reveal>

        <Reveal index={1} className="card">
          <div className="card-header">
            <div>
              <h3>Status overview</h3>
              <p>Where each document currently sits in the pipeline</p>
            </div>
          </div>
          <div className="card-body">
            <ColumnChart data={byStatus} />
            <div className="divider" />
            <div className="kv-row">
              <span className="kv-key">Average classification confidence</span>
              <span className="kv-value">
                <ConfidenceBadge confidence={averageConfidence} />
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Verified</span>
              <span className="kv-value">{totals.verified}</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Currently processing</span>
              <span className="kv-value">{totals.processing}</span>
            </div>
          </div>
        </Reveal>
      </div>

      <Reveal index={2} className="card">
        <div className="card-header">
          <div>
            <h3>Recent documents</h3>
            <p>Your latest uploads and their pipeline status</p>
          </div>
          <Link to="/documents" className="btn ghost sm">
            View all
          </Link>
        </div>
        <div className="card-body tight">
          {recent?.length ? (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>File name</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Confidence</th>
                    <th>Uploaded</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {recent.map((document, index) => (
                    <tr key={document.id} className="df-enter" style={{ '--i': index }}>
                      <td className="cell-strong truncate" style={{ maxWidth: 240 }}>
                        {document.fileName}
                      </td>
                      <td className="cell-muted">{documentTypeLabel(document.documentType)}</td>
                      <td>
                        <StatusBadge status={document.status} />
                      </td>
                      <td>
                        <ConfidenceBadge confidence={document.classificationConfidence} />
                      </td>
                      <td className="cell-muted nowrap">{formatRelative(document.createdAt)}</td>
                      <td className="cell-actions">
                        <Link to={`/documents/${document.id}`} className="btn ghost sm">
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon="⇪"
              title="No documents yet"
              text="Upload your first invoice, receipt, resume or contract to see the pipeline in action."
              action={
                <Link to="/upload" className="btn primary">
                  Upload a document
                </Link>
              }
            />
          )}
        </div>
      </Reveal>

      {totals.needsReview > 0 ? (
        <Reveal index={3} className="alert warning">
          <span className="alert-icon">!</span>
          <div className="alert-body">
            <div className="alert-title">
              {totals.needsReview} document{totals.needsReview === 1 ? '' : 's'} need{totals.needsReview === 1 ? 's' : ''} a human look
            </div>
            <div className="alert-text">
              Low confidence, missing fields or a validation discrepancy were detected.{' '}
              <Link to="/review">Open the review queue</Link>.
            </div>
          </div>
        </Reveal>
      ) : null}
    </div>
  );
}
