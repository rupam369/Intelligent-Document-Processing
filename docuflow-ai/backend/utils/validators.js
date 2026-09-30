/**
 * Input validation + sanitisation helpers.
 * Used by controllers, middleware and services alike.
 */
import { ValidationError } from './errors.js';

export const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

export const MIME_TO_EXTENSION = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
};

/** Removes control characters and trims. */
export function sanitizeText(value, maxLength = 2000) {
  if (value === undefined || value === null) return '';
  return String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

/** Strips HTML/script tags from user supplied strings. */
export function sanitizeHtml(value) {
  return sanitizeText(value)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function requireString(value, field, { min = 1, max = 500 } = {}) {
  const clean = sanitizeText(value, max);
  if (clean.length < min) {
    throw new ValidationError(`${field} is required.`);
  }
  return clean;
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || ''));
}

export function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ''),
  );
}

/** Validates an uploaded file against type + size policy. */
export function validateUpload(file, { allowedMimeTypes, maxFileSizeBytes }) {
  if (!file) throw new ValidationError('No file was received. Please choose a document.');

  const extension = `.${(file.originalname || '').split('.').pop()?.toLowerCase() || ''}`;
  const mimeOk = allowedMimeTypes.includes(file.mimetype);
  const extOk = ALLOWED_EXTENSIONS.includes(extension);

  if (!mimeOk && !extOk) {
    throw new ValidationError(
      `Unsupported file type "${extension || file.mimetype}". Supported formats: PDF, JPG, PNG.`,
    );
  }
  if (!extOk) {
    throw new ValidationError(
      `Unsupported file extension. Supported formats: PDF, JPG, PNG.`,
    );
  }
  if (file.size > maxFileSizeBytes) {
    throw new ValidationError(
      `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is ${Math.round(maxFileSizeBytes / 1024 / 1024)} MB.`,
    );
  }
  if (file.size === 0) {
    throw new ValidationError('The uploaded file is empty.');
  }
  return true;
}

/** Parses a loosely formatted currency/number string into a float. */
export function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value
    .replace(/[₹$€£¥]/g, '')
    .replace(/[^\d.,\-()]/g, '')
    .replace(/,/g, '')
    .trim();
  if (!cleaned) return null;
  const negative = /^\(.*\)$/.test(cleaned);
  const parsed = Number.parseFloat(cleaned.replace(/[()]/g, ''));
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

/** Parses many date formats into an ISO date string (YYYY-MM-DD). */
export function parseDate(value) {
  if (!value) return null;
  const raw = String(value).trim();

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }

  const months = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  // 30/09/2026 or 30-09-2026  (day first)
  const dmy = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmy) {
    let [, d, m, y] = dmy;
    if (y.length === 2) y = Number(y) > 50 ? `19${y}` : `20${y}`;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    return isValidDate(date, y, m, d) ? date.toISOString().slice(0, 10) : null;
  }

  // 09/30/2026 (month first) - only when the first group is <= 12
  const mdy = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (mdy) {
    let [, m, d, y] = mdy;
    if (y.length === 2) y = Number(y) > 50 ? `19${y}` : `20${y}`;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    return isValidDate(date, y, m, d) ? date.toISOString().slice(0, 10) : null;
  }

  // 30 Sep 2026 / Sep 30, 2026
  const named = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{2,4})$/);
  if (named) {
    const [, d, mon, y] = named;
    const month = months[mon.slice(0, 3).toLowerCase()];
    if (month !== undefined) {
      const year = y.length === 2 ? (Number(y) > 50 ? `19${y}` : `20${y}`) : y;
      return new Date(Date.UTC(Number(year), month, Number(d))).toISOString().slice(0, 10);
    }
  }
  const named2 = raw.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (named2) {
    const [, mon, d, y] = named2;
    const month = months[mon.slice(0, 3).toLowerCase()];
    if (month !== undefined) {
      const year = y.length === 2 ? (Number(y) > 50 ? `19${y}` : `20${y}`) : y;
      return new Date(Date.UTC(Number(year), month, Number(d))).toISOString().slice(0, 10);
    }
  }

  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return null;
}

function isValidDate(date, y, m, d) {
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(m) - 1 &&
    date.getUTCDate() === Number(d)
  );
}

/** Clamps a confidence value into the 0..1 range. */
export function normalizeConfidence(value, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed > 1 && parsed <= 100) return Math.min(parsed / 100, 1);
  return Math.min(Math.max(parsed, 0), 1);
}

export const CONFIDENCE_BANDS = {
  high: 0.9,
  medium: 0.7,
};

/** Maps a confidence value to the UI band: high | medium | low */
export function confidenceBand(confidence) {
  if (confidence >= CONFIDENCE_BANDS.high) return 'high';
  if (confidence >= CONFIDENCE_BANDS.medium) return 'medium';
  return 'low';
}

export default {
  sanitizeText,
  sanitizeHtml,
  requireString,
  isValidEmail,
  isValidUuid,
  validateUpload,
  parseNumber,
  parseDate,
  normalizeConfidence,
  confidenceBand,
};
