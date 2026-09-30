/**
 * Documents page - list, filter, smart search and comparison.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { Loading, ErrorState, EmptyState, StatCard } from '../components/States.jsx';
import DocumentCard from '../components/DocumentCard.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import ConfidenceBadge from '../components/ConfidenceBadge.jsx';
import Modal from '../components/Modal.jsx';
import useToast from '../components/Toast.jsx';
import { documentTypeLabel, formatRelative, humanise, formatPercent } from '../utils/format.js';

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'resume', label: 'Resume' },
  { value: 'contract', label: 'Contract' },
  { value: 'bank_statement', label: 'Bank Statement' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'application_form', label: 'Application Form' },
  { value: 'other', label: 'Other' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'verified', label: 'Verified' },
  { value: 'needs_review', label: 'Needs Review' },
  { value: 'processing', label: 'Processing' },
  { value: 'error', label: 'Error' },
  { value: 'needs_attention', label: 'Needs Attention' },
];

const SUGGESTED_QUERIES = [
  'Show invoices above 50000',
  'Find contracts expiring soon',
  'Show documents that need review',
  'Bank statements',
];

export default function Documents({ onDocumentsChanged }) {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [view, setView] = useState(searchParams.get('q') ? 'search' : 'grid');
  const [selected, setSelected] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [comparing, setComparing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await api.listDocuments({ type, status, limit: 300 });
      setDocuments(payload.documents);
      onDocumentsChanged?.();
    } catch (listError) {
      setError(listError.message);
    } finally {
      setLoading(false);
    }
  }, [type, status, onDocumentsChanged]);

  useEffect(() => {
    load();
  }, [load]);

  const runSearch = useCallback(async (text) => {
    const trimmed = (text ?? '').trim();
    if (!trimmed) {
      setSearchResults(null);
      setSearchParams({}, { replace: true });
      return;
    }
    setSearching(true);
    try {
      const payload = await api.search(trimmed);
      setSearchResults(payload);
      setSearchParams({ q: trimmed }, { replace: true });
    } catch (searchError) {
      toast.error('Search failed', searchError.message);
    } finally {
      setSearching(false);
    }
  }, [setSearchParams, toast]);

  async function handleDelete(document) {
    if (!window.confirm(`Delete "${document.fileName}"? This cannot be undone.`)) return;
    try {
      await api.deleteDocument(document.id);
      toast.success('Document deleted', `"${document.fileName}" was removed.`);
      load();
    } catch (deleteError) {
      toast.error('Delete failed', deleteError.message);
    }
  }

  function toggleSelect(document) {
    setSelected((current) => {
      const exists = current.find((item) => item.id === document.id);
      if (exists) return current.filter((item) => item.id !== document.id);
      if (current.length >= 2) return [current[1], document];
      return [...current, document];
    });
  }

  async function handleCompare() {
    if (selected.length !== 2) return;
    setComparing(true);
    try {
      const payload = await api.compare(selected[0].id, selected[1].id);
      setComparison(payload);
    } catch (compareError) {
      toast.error('Comparison failed', compareError.message);
    } finally {
      setComparing(false);
    }
  }

  const list = useMemo(() => {
    if (view === 'search' && searchResults) return searchResults.results.map((item) => item.document);
    return documents;
  }, [view, searchResults, documents]);

  const matchedFields = useMemo(() => {
    const map = {};
    if (view === 'search' && searchResults) {
      for (const item of searchResults.results) {
        map[item.document.id] = item.matchedFields;
      }
    }
    return map;
  }, [view, searchResults]);

  return (
    <div className="stack lg">
      <div className="page-header">
        <div>
          <h1>Documents</h1>
          <p>Browse, search and compare everything in your workspace.</p>
        </div>
        <div className="page-actions">
          <Link to="/upload" className="btn primary">
            Upload
          </Link>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${view === 'grid' ? 'active' : ''}`} onClick={() => setView('grid')}>
          All documents
        </button>
        <button className={`tab ${view === 'search' ? 'active' : ''}`} onClick={() => setView('search')}>
          Smart search
        </button>
        <button className={`tab ${view === 'compare' ? 'active' : ''}`} onClick={() => setView('compare')}>
          Compare
        </button>
      </div>

      {view === 'search' ? (
        <div className="card df-enter" style={{ '--i': 0 }}>
          <div className="card-body stack md">
            <form
              className="row"
              onSubmit={(event) => {
                event.preventDefault();
                runSearch(query);
              }}
            >
              <input
                className="search-input"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder='Try "Show invoices above 50000" or "documents that need review"'
                aria-label="Smart search"
              />
              <button className="btn primary" type="submit" disabled={searching}>
                {searching ? <span className="spinner" /> : null}
                Search
              </button>
              {searchResults ? (
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setSearchResults(null);
                    setSearchParams({}, { replace: true });
                  }}
                >
                  Clear
                </button>
              ) : null}
            </form>

            <div className="row wrap" style={{ gap: 6 }}>
              {SUGGESTED_QUERIES.map((suggestion) => (
                <button
                  key={suggestion}
                  className="chip"
                  onClick={() => {
                    setQuery(suggestion);
                    runSearch(suggestion);
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>

            {searchResults ? (
              <div className="alert neutral">
                <span className="alert-icon">⌕</span>
                <div className="alert-body">
                  <div className="alert-title">
                    {searchResults.total} match{searchResults.total === 1 ? '' : 'es'} for “{searchResults.query}”
                  </div>
                  <div className="alert-text">Interpreted as: {searchResults.interpretation}</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {view === 'grid' ? (
        <div className="filter-bar">
          <select className="search-input" style={{ maxWidth: 190, flex: 'none' }} value={type} onChange={(event) => setType(event.target.value)}>
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select className="search-input" style={{ maxWidth: 190, flex: 'none' }} value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="small muted grow" style={{ textAlign: 'right' }}>
            {list.length} document{list.length === 1 ? '' : 's'}
          </span>
        </div>
      ) : null}

      {view === 'compare' ? (
        <div className="card df-enter" style={{ '--i': 1 }}>
          <div className="card-body stack md">
            <p className="small muted">
              Select exactly two documents of the same type. The comparison shows the concrete extracted
              differences first, and any AI interpretation separately.
            </p>
            <div className="row wrap" style={{ gap: 8 }}>
              <span className={`badge ${selected.length === 2 ? 'success' : 'neutral'}`}>
                {selected.length}/2 selected
              </span>
              {selected.map((document) => (
                <span key={document.id} className="badge brand">
                  {document.fileName}
                </span>
              ))}
            </div>
            <button className="btn primary" onClick={handleCompare} disabled={selected.length !== 2 || comparing}>
              {comparing ? <span className="spinner" /> : null}
              Compare documents
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <Loading label="Loading documents..." />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : list.length === 0 ? (
        <EmptyState
          icon="▤"
          title={view === 'search' ? 'No matches' : 'No documents found'}
          text={
            view === 'search'
              ? 'Try a different query, for example a document type, a status, or an amount.'
              : 'Adjust your filters, or upload a new document to get started.'
          }
          action={
            <Link to="/upload" className="btn primary">
              Upload a document
            </Link>
          }
        />
      ) : view === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(258px, 1fr))', gap: 14 }}>
          {list.map((document, index) => (
            <DocumentCard key={document.id} document={document} index={index} onDelete={handleDelete} />
          ))}
        </div>
      ) : (
        <div className="card df-enter" style={{ '--i': 2 }}>
          <div className="card-body tight">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    {view === 'compare' ? <th style={{ width: 40 }} /> : null}
                    <th>File name</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Confidence</th>
                    <th>Uploaded</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.map((document) => (
                    <tr key={document.id}>
                      {view === 'compare' ? (
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.some((item) => item.id === document.id)}
                            onChange={() => toggleSelect(document)}
                            aria-label={`Select ${document.fileName}`}
                          />
                        </td>
                      ) : null}
                      <td className="cell-strong truncate" style={{ maxWidth: 230 }}>
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
          </div>
        </div>
      )}

      {view === 'search' && searchResults?.results.some((item) => item.matchedFields?.length) ? (
        <div className="card df-enter" style={{ '--i': 3 }}>
          <div className="card-header">
            <div>
              <h3>Matched fields</h3>
              <p>The extracted values that matched your query</p>
            </div>
          </div>
          <div className="card-body tight">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Field</th>
                    <th>Value</th>
                    <th>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.results
                    .filter((item) => item.matchedFields?.length)
                    .flatMap((item) =>
                      item.matchedFields.map((field, index) => (
                        <tr key={`${item.document.id}-${field.field}-${index}`} className="df-enter" style={{ '--i': index }}>
                          <td className="cell-muted truncate" style={{ maxWidth: 180 }}>
                            {item.document.fileName}
                          </td>
                          <td className="cell-strong">{humanise(field.field)}</td>
                          <td>{String(field.value).slice(0, 80)}</td>
                          <td>{formatPercent(field.confidence)}</td>
                        </tr>
                      )),
                    )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {comparison ? (
        <Modal
          title="Document comparison"
          subtitle={`${comparison.comparison.documentA.fileName} vs ${comparison.comparison.documentB.fileName}`}
          onClose={() => setComparison(null)}
          wide
          footer={
            <button className="btn" onClick={() => setComparison(null)}>
              Close
            </button>
          }
        >
          <div className="stack md">
            <div className="alert neutral">
              <span className="alert-icon">i</span>
              <div className="alert-body">
                <div className="alert-title">{comparison.summary}</div>
                {comparison.comparison.reason ? (
                  <div className="alert-text">{comparison.comparison.reason}</div>
                ) : null}
              </div>
            </div>

            {comparison.comparison.diff.changed.length ? (
              <div className="card df-enter" style={{ '--i': 4 }}>
                <div className="card-header">
                  <h3>Changed values</h3>
                </div>
                <div className="card-body tight">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>{comparison.comparison.documentA.fileName}</th>
                        <th />
                        <th>{comparison.comparison.documentB.fileName}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.comparison.diff.changed.map((change) => (
                        <tr key={change.field}>
                          <td className="cell-strong">{humanise(change.field)}</td>
                          <td className="cell-muted">{String(change.from).slice(0, 70)}</td>
                          <td className="subtle">→</td>
                          <td className="cell-strong">{String(change.to).slice(0, 70)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {comparison.comparison.diff.added.length || comparison.comparison.diff.removed.length ? (
              <div className="chart-grid">
                {comparison.comparison.diff.added.length ? (
                  <div className="card df-enter" style={{ '--i': 5 }}>
                    <div className="card-header">
                      <h3>Added information</h3>
                    </div>
                    <div className="card-body">
                      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                        {comparison.comparison.diff.added.map((item) => (
                          <li key={item.field}>
                            <strong>{humanise(item.field)}</strong>: {String(item.value).slice(0, 90)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}
                {comparison.comparison.diff.removed.length ? (
                  <div className="card df-enter" style={{ '--i': 6 }}>
                    <div className="card-header">
                      <h3>Removed information</h3>
                    </div>
                    <div className="card-body">
                      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                        {comparison.comparison.diff.removed.map((item) => (
                          <li key={item.field}>
                            <strong>{humanise(item.field)}</strong>: {String(item.value).slice(0, 90)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {comparison.comparison.listChanges.length ? (
              <div className="card df-enter" style={{ '--i': 7 }}>
                <div className="card-header">
                  <h3>Changed clauses / list entries</h3>
                </div>
                <div className="card-body stack sm">
                  {comparison.comparison.listChanges.map((change) => (
                    <div key={change.field}>
                      <div className="small bold" style={{ marginBottom: 4 }}>
                        {humanise(change.field)}
                      </div>
                      {change.removed.map((entry) => (
                        <div key={`r-${entry}`} className="small" style={{ color: 'var(--danger)' }}>
                          − {entry}
                        </div>
                      ))}
                      {change.added.map((entry) => (
                        <div key={`a-${entry}`} className="small" style={{ color: 'var(--success)' }}>
                          + {entry}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {comparison.comparison.interpretation ? (
              <div className="alert info">
                <span className="alert-icon">AI</span>
                <div className="alert-body">
                  <div className="alert-title">AI interpretation</div>
                  <div className="alert-text">{comparison.comparison.interpretation.text}</div>
                  <div className="tiny" style={{ marginTop: 6, opacity: 0.8 }}>
                    {comparison.comparison.interpretation.disclaimer}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
