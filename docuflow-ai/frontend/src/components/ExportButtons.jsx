/**
 * Export buttons - JSON, CSV and PDF report.
 */
import { useState } from 'react';
import { api } from '../services/api.js';
import { downloadBlob, fileNameFromDisposition } from '../utils/format.js';
import useToast from './Toast.jsx';

const FORMATS = [
  { key: 'json', label: 'Export JSON', hint: 'Structured extracted data' },
  { key: 'csv', label: 'Export CSV', hint: 'Tabular fields' },
  { key: 'pdf', label: 'Generate PDF Report', hint: 'Full document report' },
];

export default function ExportButtons({ documentId, fileName, variant = 'row' }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);

  async function handleExport(format) {
    setBusy(format);
    try {
      const response = await api.downloadExport(documentId, format);
      const blob = await response.blob();
      const name = fileNameFromDisposition(response.headers.get('content-disposition'), `${fileName}.${format}`);
      downloadBlob(blob, name);
      toast.success('Export ready', `${name} has been downloaded.`);
    } catch (error) {
      toast.error('Export failed', error.message);
    } finally {
      setBusy(null);
    }
  }

  if (variant === 'menu') {
    return (
      <div className="stack sm">
        {FORMATS.map((format) => (
          <button
            key={format.key}
            className="btn block"
            onClick={() => handleExport(format.key)}
            disabled={busy !== null}
          >
            {busy === format.key ? <span className="spinner dark" /> : null}
            {format.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="btn-row">
      {FORMATS.map((format) => (
        <button
          key={format.key}
          className={`btn ${format.key === 'pdf' ? 'primary' : ''}`}
          onClick={() => handleExport(format.key)}
          disabled={busy !== null}
          title={format.hint}
        >
          {busy === format.key ? <span className="spinner" /> : null}
          {format.label}
        </button>
      ))}
    </div>
  );
}
