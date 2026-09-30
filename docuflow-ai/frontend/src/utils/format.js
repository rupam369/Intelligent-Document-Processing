/**
 * Formatting helpers shared across the UI.
 */

/** Maps a 0..1 confidence score to a display band. */
export function confidenceBand(confidence) {
  if (confidence === null || confidence === undefined) return 'unknown';
  if (confidence >= 0.9) return 'high';
  if (confidence >= 0.7) return 'medium';
  return 'low';
}

export const BAND_LABELS = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Needs review',
  unknown: 'Not scored',
};

export function formatPercent(confidence, digits = 0) {
  if (confidence === null || confidence === undefined || Number.isNaN(Number(confidence))) return '--';
  return `${(Number(confidence) * 100).toFixed(digits)}%`;
}

const CURRENCY_SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£', JPY: '¥' };

/** Formats a monetary value using the document's currency. */
export function formatMoney(value, currency = 'INR') {
  if (value === null || value === undefined || value === '') return '--';
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(numeric)) return String(value);
  const symbol = CURRENCY_SYMBOLS[currency] || `${currency} `;
  return `${symbol}${numeric.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Formats a value for display based on its extracted field name. */
export function formatFieldValue(name, entry, currency = 'INR') {
  if (!entry || entry.value === null || entry.value === undefined || entry.value === '') return '--';

  const isMoney =
    entry.unit === 'currency' ||
    /amount|total|subtotal|tax|gst|balance|payment|fees|retainer/i.test(name);

  if (isMoney && (typeof entry.value === 'number' || /^[\d,.]+$/.test(String(entry.value)))) {
    return formatMoney(entry.value, currency);
  }

  if (Array.isArray(entry.value)) {
    if (!entry.value.length) return '--';
    if (typeof entry.value[0] === 'object') {
      return entry.value
        .map((item) =>
          Object.entries(item)
            .filter(([, v]) => v !== null && v !== undefined && v !== '')
            .map(([key, value]) => `${humanise(key)}: ${value}`)
            .join(' · '),
        )
        .join('  |  ');
    }
    return entry.value.join(', ');
  }

  if (typeof entry.value === 'object') {
    return Object.entries(entry.value)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([key, value]) => `${humanise(key)}: ${value}`)
      .join(' · ');
  }

  return String(entry.value);
}

/** Turns snake_case field names into readable labels. */
export function humanise(name) {
  return String(name)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bGst\b/, 'GST')
    .replace(/\bId\b/, 'ID');
}

/** Formats an ISO date for display (falls back to the raw string). */
export function formatDate(value, withTime = false) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const options = { year: 'numeric', month: 'short', day: '2-digit' };
  if (withTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  return date.toLocaleDateString('en-GB', options);
}

export function formatRelative(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(value);
}

export function formatBytes(bytes) {
  if (!bytes) return '--';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}

/** Short label for a document type. */
export function documentTypeLabel(type) {
  const labels = {
    invoice: 'Invoice',
    receipt: 'Receipt',
    resume: 'Resume',
    contract: 'Contract',
    bank_statement: 'Bank Statement',
    certificate: 'Certificate',
    application_form: 'Application Form',
    other: 'Other',
    unknown: 'Unclassified',
  };
  return labels[type] || 'Other';
}

export const STATUS_LABELS = {
  uploaded: 'Uploaded',
  processing: 'Processing',
  verified: 'Verified',
  reviewed: 'Reviewed',
  needs_review: 'Needs Review',
  needs_attention: 'Needs Attention',
  error: 'Error',
};

export const STATUS_TONE = {
  uploaded: 'neutral',
  processing: 'info',
  verified: 'success',
  reviewed: 'success',
  needs_review: 'warning',
  needs_attention: 'warning',
  error: 'danger',
};

/** Extracts a file extension for the file-type pill. */
export function fileExtension(fileName = '') {
  const extension = fileName.split('.').pop();
  return extension && extension !== fileName ? extension.toUpperCase() : 'FILE';
}

/** Triggers a browser download for a blob response. */
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Derives a sensible download name from a Content-Disposition header. */
export function fileNameFromDisposition(disposition, fallback) {
  if (!disposition) return fallback;
  const match = disposition.match(/filename="?([^"]+)"?/i);
  return match ? match[1] : fallback;
}

export default {
  confidenceBand,
  formatPercent,
  formatMoney,
  formatFieldValue,
  humanise,
  formatDate,
  formatRelative,
  formatBytes,
  documentTypeLabel,
  fileExtension,
  downloadBlob,
  fileNameFromDisposition,
};
