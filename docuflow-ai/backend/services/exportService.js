/**
 * Export service - JSON, CSV and PDF report generation.
 */
import { getSchemaFor } from './extractionService.js';
import { labelForType } from './classificationService.js';
import { buildPdfReport } from '../utils/pdfReport.js';
import { sanitizeText } from '../utils/validators.js';

const toNumber = (value) => (typeof value === 'number' ? value : Number.parseFloat(String(value).replace(/,/g, '')));

/** Formats a field value for flat (CSV / PDF) output. */
export function flattenValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'object' ? Object.values(item).filter(Boolean).join(' | ') : String(item)))
      .join('; ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Structured JSON export payload.
 */
export function buildJsonExport({ document, fields, validationResults, chatMessages = [], reviewActions = [] }) {
  const schema = getSchemaFor(document.document_type);
  const extracted = {};

  for (const [name, entry] of Object.entries(fields || {})) {
    extracted[name] = {
      value: entry.value ?? null,
      confidence: entry.confidence ?? null,
      unit: entry.unit ?? (schema[name]?.type === 'currency' ? 'currency' : undefined),
    };
  }

  const confidences = Object.values(fields || {}).map((entry) => entry.confidence ?? 0);
  const averageConfidence = confidences.length
    ? Number((confidences.reduce((sum, value) => sum + value, 0) / confidences.length).toFixed(3))
    : 0;

  return {
    meta: {
      generator: 'DocuFlow AI',
      exportedAt: new Date().toISOString(),
      note: 'Extracted values are machine-read from the source document and may require human verification.',
    },
    document: {
      id: document.id,
      fileName: document.file_name,
      documentType: document.document_type,
      documentTypeLabel: labelForType(document.document_type),
      status: document.status,
      classificationConfidence: document.classification_confidence ?? null,
      averageFieldConfidence: averageConfidence,
      createdAt: document.created_at,
      updatedAt: document.updated_at,
    },
    extractedFields: extracted,
    validation: {
      summary: {
        total: validationResults.length,
        passed: validationResults.filter((item) => item.status === 'pass').length,
        failed: validationResults.filter((item) => item.status === 'fail').length,
        warnings: validationResults.filter((item) => item.status === 'warning').length,
      },
      results: validationResults.map((item) => ({
        rule: item.rule_name,
        status: item.status,
        expected: item.expected_value,
        actual: item.actual_value,
        message: item.message,
      })),
    },
    review: reviewActions.map((action) => ({
      action: action.action,
      fieldName: action.field_name,
      previousValue: action.previous_value,
      newValue: action.new_value,
      comment: action.comment,
      createdAt: action.created_at,
    })),
    chatHistory: chatMessages.map((message) => ({
      question: message.question,
      answer: message.answer,
      createdAt: message.created_at,
    })),
  };
}

/** CSV export: one row per extracted field plus validation rows. */
export function buildCsvExport({ document, fields, validationResults }) {
  const schema = getSchemaFor(document.document_type);
  const rows = [];

  const escape = (value) => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  rows.push(['section', 'field', 'label', 'value', 'confidence', 'status', 'detail'].join(','));

  for (const [name, entry] of Object.entries(fields || {})) {
    rows.push(
      [
        'extracted_field',
        escape(name),
        escape(schema[name]?.label || name),
        escape(flattenValue(entry.value)),
        entry.confidence ?? '',
        'extracted',
        escape(entry.note || ''),
      ].join(','),
    );
  }

  for (const item of validationResults) {
    rows.push(
      [
        'validation',
        escape(item.rule_name),
        escape(item.label || item.rule_name),
        escape(item.actual_value || ''),
        '',
        escape(item.status),
        escape(item.message || ''),
      ].join(','),
    );
  }

  return rows.join('\n');
}

/** PDF report export. */
export function buildPdfExport({ document, fields, validationResults, reviewActions = [] }) {
  const schema = getSchemaFor(document.document_type);
  const confidences = Object.values(fields || {}).map((entry) => entry.confidence ?? 0);
  const averageConfidence = confidences.length
    ? Math.round((confidences.reduce((sum, value) => sum + value, 0) / confidences.length) * 100)
    : 0;

  const sections = [];

  sections.push({
    heading: 'Document Information',
    rows: [
      ['File name', document.file_name],
      ['Document type', labelForType(document.document_type)],
      ['Status', document.status.replace(/_/g, ' ')],
      ['Uploaded', document.created_at],
      ['Last updated', document.updated_at],
    ],
  });

  sections.push({
    heading: 'Classification',
    rows: [
      ['Predicted type', labelForType(document.document_type)],
      ['Confidence', `${Math.round((document.classification_confidence ?? 0) * 100)}%`],
      ['Average field confidence', `${averageConfidence}%`],
    ],
  });

  const extractedRows = Object.entries(fields || {}).map(([name, entry]) => {
    const confidence = entry.confidence ?? 0;
    const band = confidence >= 0.9 ? 'high' : confidence >= 0.7 ? 'medium' : 'needs review';
    return [`${schema[name]?.label || name}`, `${flattenValue(entry.value)} (${Math.round(confidence * 100)}% - ${band})`];
  });
  sections.push({
    heading: 'Extracted Data',
    rows: extractedRows.length ? extractedRows : ['No fields were extracted from this document.'],
  });

  const validationRows = validationResults.map((item) => {
    const marker = item.status === 'pass' ? 'PASS' : item.status === 'fail' ? 'FAIL' : item.status.toUpperCase();
    return [`${item.label || item.rule_name} [${marker}]`, item.message || ''];
  });
  sections.push({
    heading: 'Validation Results',
    rows: validationRows.length ? validationRows : ['No validation rules ran for this document type.'],
  });

  if (reviewActions.length) {
    sections.push({
      heading: 'Review History',
      rows: reviewActions.map((action) => [
        action.action,
        `${action.field_name ? `${action.field_name}: ` : ''}${action.previous_value ?? ''} -> ${action.new_value ?? ''}${action.comment ? ` (${action.comment})` : ''}`,
      ]),
    });
  }

  return buildPdfReport({
    title: 'DocuFlow AI - Document Report',
    subtitle: `${document.file_name} - generated ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
    sections,
  });
}

/** Sanitises a file name for a Content-Disposition header. */
export function safeFileName(originalName, extension) {
  const base = sanitizeText(originalName || 'document', 60).replace(/[^a-zA-Z0-9._-]/g, '_') || 'document';
  const withoutExt = base.replace(/\.[^.]+$/, '');
  return `${withoutExt}.${extension}`;
}

export { toNumber };

export default { buildJsonExport, buildCsvExport, buildPdfExport, flattenValue, safeFileName };
