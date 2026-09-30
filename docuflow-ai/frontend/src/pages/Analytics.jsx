/**
 * Analytics page - charts and pipeline metrics.
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { Loading, ErrorState, EmptyState, StatCard } from '../components/States.jsx';
import { DonutChart, BarList, ColumnChart } from '../components/Charts.jsx';
import { formatPercent } from '../utils/format.js';

export default function Analytics() {
  const [stats, setStats] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsPayload, documentsPayload] = await Promise.all([
        api.stats(),
        api.listDocuments({ limit: 500 }),
      ]);
      setStats(statsPayload);
      setDocuments(documentsPayload.documents);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Loading label="Crunching your numbers..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!stats) return null;

  const { totals, byType, byStatus, averageConfidence } = stats;

  // Average confidence per document type.
  const confidenceByType = {};
  const countsByType = {};
  for (const document of documents) {
    if (typeof document.classificationConfidence !== 'number') continue;
    confidenceByType[document.documentType] =
      (confidenceByType[document.documentType] || 0) + document.classificationConfidence;
    countsByType[document.documentType] = (countsByType[document.documentType] || 0) + 1;
  }
  const averageByType = Object.fromEntries(
    Object.entries(confidenceByType).map(([type, sum]) => [
      type,
      Number((sum / countsByType[type]).toFixed(2)),
    ]),
  );

  const processedShare = totals.documents ? Math.round((totals.processed / totals.documents) * 100) : 0;

  return (
    <div className="stack lg">
      <div className="page-header">
        <div>
          <h1>Analytics</h1>
          <p>How your document pipeline is performing across the workspace.</p>
        </div>
      </div>

      {!totals.documents ? (
        <div className="card">
          <div className="card-body">
            <EmptyState
              icon="◔"
              title="No data yet"
              text="Upload and process a few documents to unlock analytics."
            />
          </div>
        </div>
      ) : null}

      <div className="stat-grid">
        <StatCard label="Documents" value={totals.documents} icon="▤" tone="brand" hint="Total uploads" />
        <StatCard
          label="Processed share"
          value={`${processedShare}%`}
          icon="◔"
          tone="info"
          hint={`${totals.processed} of ${totals.documents} processed`}
        />
        <StatCard
          label="Average confidence"
          value={formatPercent(averageConfidence)}
          icon="✓"
          tone="success"
          hint="Classification confidence across all documents"
        />
        <StatCard
          label="Needs review"
          value={totals.needsReview}
          icon="!"
          tone="warning"
          hint="Awaiting a human decision"
        />
      </div>

      <div className="chart-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Document type distribution</h3>
              <p>Share of your workspace by document type</p>
            </div>
          </div>
          <div className="card-body">
            <DonutChart data={byType} size={160} />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h3>Documents by type</h3>
              <p>Absolute counts</p>
            </div>
          </div>
          <div className="card-body">
            <BarList data={byType} />
          </div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Pipeline status</h3>
              <p>Where documents currently sit</p>
            </div>
          </div>
          <div className="card-body">
            <ColumnChart data={byStatus} height={150} />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h3>Average confidence by type</h3>
              <p>How reliably each document type is being read</p>
            </div>
          </div>
          <div className="card-body">
            {Object.keys(averageByType).length ? (
              <div className="bar-list">
                {Object.entries(averageByType).map(([type, value]) => (
                  <div key={type} className="bar-item">
                    <div className="bar-head">
                      <span>{type.replace(/_/g, ' ')}</span>
                      <strong>{formatPercent(value)}</strong>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${value * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon="◔" title="No confidence data" text="Process a document to see confidence trends." />
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>Status breakdown</h3>
            <p>Every status value in your workspace</p>
          </div>
        </div>
        <div className="card-body">
          <div className="row wrap" style={{ gap: 10 }}>
            {Object.entries(byStatus).map(([status, count]) => (
              <div key={status} className="stat-card" style={{ minWidth: 150, flex: '1 1 150px' }}>
                <span className="stat-label" style={{ textTransform: 'capitalize' }}>
                  {status.replace(/_/g, ' ')}
                </span>
                <span className="stat-value" style={{ fontSize: 22 }}>
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
