/**
 * Document controller.
 *
 * Upload, list, retrieve, delete, search, compare and dashboard stats.
 * Controllers stay thin: storage, the pipeline and validation all live in
 * services.
 */
import { asyncHandler } from '../middleware/errorMiddleware.js';
import { db, assertOwnership } from '../services/database.js';
import { saveDocument, deleteDocument, readDocument, getDocumentUrl, storageInfo } from '../services/storageService.js';
import { processDocument, PIPELINE_STAGES } from '../services/pipelineService.js';
import { compareDocuments, summariseDiff } from '../services/comparisonService.js';
import { getSchemaFor } from '../services/extractionService.js';
import { labelForType } from '../services/classificationService.js';
import { requireString } from '../utils/validators.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

const STATUSES = ['uploaded', 'processing', 'verified', 'needs_review', 'error', 'reviewed', 'needs_attention'];

/* ------------------------------------------------------------------ *
 * Serialisation helpers
 * ------------------------------------------------------------------ */

function parseFieldValue(raw) {
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Turns extracted_data rows into {field: {value, confidence}} plus labels. */
async function loadFields(documentId) {
  const rows = await db.getExtractedData(documentId);
  const fields = {};
  for (const row of rows) {
    fields[row.field_name] = {
      value: parseFieldValue(row.field_value),
      confidence: row.confidence === null ? null : Number(row.confidence),
    };
  }
  return fields;
}

function serializeDocument(document, extra = {}) {
  return {
    id: document.id,
    fileName: document.file_name,
    filePath: document.file_path,
    fileSize: document.file_size,
    mimeType: document.mime_type,
    documentType: document.document_type,
    documentTypeLabel: labelForType(document.document_type),
    classificationConfidence: document.classification_confidence,
    alternatives: document.classification_alternatives || [],
    status: document.status,
    statusReason: document.status_reason,
    progress: document.progress ?? 0,
    currentStage: document.current_stage,
    stageMessage: document.stage_message,
    pageCount: document.page_count,
    errorMessage: document.error_message,
    validationSummary: document.validation_summary || null,
    missingFields: document.missing_fields || [],
    extractionEngine: document.extraction_engine,
    ocrProvider: document.ocr_provider,
    demoMode: Boolean(document.ocr_meta?.demoMode),
    createdAt: document.created_at,
    updatedAt: document.updated_at,
    processedAt: document.processed_at,
    ...extra,
  };
}

/* ------------------------------------------------------------------ *
 * Upload
 * ------------------------------------------------------------------ */

/**
 * POST /api/documents/upload
 * Stores the file, creates the DB record and starts the pipeline.
 */
export const uploadDocument = asyncHandler(async (request, response) => {
  const file = request.file;
  if (!file) throw new ValidationError('No file was received. Please choose a document.');

  const { storagePath, storageBackend } = await saveDocument({
    buffer: file.buffer,
    mimeType: file.mimetype,
    fileName: file.originalname,
    userId: request.user.id,
  });

  const document = await db.createDocument(request.user.id, {
    file_name: file.originalname,
    file_path: storagePath,
    file_size: file.size,
    mime_type: file.mimetype,
    document_type: 'unknown',
    classification_confidence: null,
    status: 'processing',
    progress: 5,
    current_stage: 'upload',
    stage_message: 'Document uploaded. Starting the processing pipeline...',
    storage_backend: storageBackend,
  });

  logger.info('Document uploaded', {
    documentId: document.id,
    userId: request.user.id,
    fileName: file.originalname,
    bytes: file.size,
  });

  // Run the pipeline in the background so the client can poll progress.
  processDocument({ documentId: document.id, userId: request.user.id }).catch((error) => {
    logger.error('Background pipeline failed', { documentId: document.id, error: error.message });
  });

  response.status(201).json({
    document: serializeDocument(document),
    pipeline: PIPELINE_STAGES,
    message: 'Document uploaded. Processing has started.',
  });
});

/* ------------------------------------------------------------------ *
 * List / read / delete
 * ------------------------------------------------------------------ */

/** GET /api/documents */
export const listDocuments = asyncHandler(async (request, response) => {
  const { status, type, search, limit } = request.query;
  if (status && !STATUSES.includes(status)) {
    throw new ValidationError(`Unknown status filter "${status}".`);
  }

  const documents = await db.listDocuments(request.user.id, {
    status,
    document_type: type,
    search,
    limit: Math.min(Number(limit) || 100, 500),
  });

  response.json({
    documents: documents.map((document) => serializeDocument(document)),
    total: documents.length,
  });
});

/** GET /api/documents/:id */
export const getDocument = asyncHandler(async (request, response) => {
  const document = assertOwnership(await db.getDocument(request.user.id, request.params.id), request.user.id);

  const [fields, validationResults, logs] = await Promise.all([
    loadFields(document.id),
    db.getValidationResults(document.id),
    db.getProcessingLogs(document.id),
  ]);

  response.json({
    document: serializeDocument(document, {
      fileUrl: await getDocumentUrl(document.file_path).catch(() => null),
      ocrText: document.ocr_text || null,
      ocrMeta: document.ocr_meta || null,
    }),
    fields,
    validationResults,
    processingLogs: logs.map((log) => ({
      stage: log.stage,
      status: log.status,
      progress: log.progress,
      message: log.message,
      durationMs: log.duration_ms,
      createdAt: log.created_at,
    })),
    pipeline: PIPELINE_STAGES,
    schema: getSchemaFor(document.document_type),
  });
});

/** DELETE /api/documents/:id */
export const removeDocument = asyncHandler(async (request, response) => {
  const document = assertOwnership(await db.getDocument(request.user.id, request.params.id), request.user.id);

  await deleteDocument(document.file_path).catch((error) => {
    logger.warn('Could not delete stored file', { documentId: document.id, error: error.message });
  });
  await db.deleteDocument(request.user.id, document.id);

  logger.info('Document deleted', { documentId: document.id, userId: request.user.id });
  response.json({ success: true, message: `"${document.file_name}" was deleted.` });
});

/** GET /api/documents/file/:path - streams the stored document for preview. */
export const streamDocumentFile = asyncHandler(async (request, response) => {
  const storagePath = decodeURIComponent(request.params.path);
  const document = await db.listDocuments(request.user.id, { limit: 500 }).then((docs) =>
    docs.find((doc) => doc.file_path === storagePath),
  );
  if (!document) throw new NotFoundError('Document not found.');

  const buffer = await readDocument(storagePath);
  response.setHeader('content-type', document.mime_type || 'application/octet-stream');
  response.setHeader('content-length', buffer.length);
  response.setHeader('cache-control', 'private, max-age=300');
  response.send(buffer);
});

/* ------------------------------------------------------------------ *
 * Extracted data / validation
 * ------------------------------------------------------------------ */

/** GET /api/documents/:id/extracted-data */
export const getExtractedData = asyncHandler(async (request, response) => {
  const document = assertOwnership(await db.getDocument(request.user.id, request.params.id), request.user.id);
  const fields = await loadFields(document.id);
  const schema = getSchemaFor(document.document_type);

  response.json({
    documentId: document.id,
    documentType: document.document_type,
    fields,
    schema,
    missingFields: document.missing_fields || [],
    engine: document.extraction_engine,
  });
});

/** GET /api/documents/:id/validation */
export const getValidation = asyncHandler(async (request, response) => {
  const document = assertOwnership(await db.getDocument(request.user.id, request.params.id), request.user.id);
  const results = await db.getValidationResults(document.id);

  response.json({
    documentId: document.id,
    summary: document.validation_summary || {
      total: results.length,
      passed: results.filter((item) => item.status === 'pass').length,
      failed: results.filter((item) => item.status === 'fail').length,
      warnings: results.filter((item) => item.status === 'warning').length,
      skipped: results.filter((item) => item.status === 'skipped').length,
    },
    results,
  });
});

/** GET /api/documents/:id/logs */
export const getProcessingLogs = asyncHandler(async (request, response) => {
  const document = assertOwnership(await db.getDocument(request.user.id, request.params.id), request.user.id);
  const logs = await db.getProcessingLogs(document.id);
  response.json({ logs, pipeline: PIPELINE_STAGES });
});

/* ------------------------------------------------------------------ *
 * Dashboard stats
 * ------------------------------------------------------------------ */

/** GET /api/documents/stats */
export const getStats = asyncHandler(async (request, response) => {
  const documents = await db.listDocuments(request.user.id, { limit: 500 });

  const byType = {};
  const byStatus = {};
  let processed = 0;
  let needsReview = 0;
  let withErrors = 0;
  let verified = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;

  for (const document of documents) {
    byType[document.document_type] = (byType[document.document_type] || 0) + 1;
    byStatus[document.status] = (byStatus[document.status] || 0) + 1;

    if (document.status === 'verified' || document.status === 'reviewed' || document.status === 'needs_attention') processed += 1;
    if (document.status === 'verified') verified += 1;
    if (document.status === 'needs_review' || document.status === 'needs_attention') needsReview += 1;
    if (document.status === 'error') withErrors += 1;
    if (typeof document.classification_confidence === 'number') {
      confidenceSum += document.classification_confidence;
      confidenceCount += 1;
    }
  }

  response.json({
    totals: {
      documents: documents.length,
      processed,
      needsReview,
      withErrors,
      verified,
      processing: byStatus.processing || 0,
      uploaded: byStatus.uploaded || 0,
    },
    byType,
    byStatus,
    averageConfidence: confidenceCount ? Number((confidenceSum / confidenceCount).toFixed(3)) : 0,
    recent: documents.slice(0, 6).map((document) => serializeDocument(document)),
  });
});

/* ------------------------------------------------------------------ *
 * Search
 * ------------------------------------------------------------------ */

const NL_PATTERNS = [
  { test: /needs?\s+review|for review|pending review/i, status: 'needs_review' },
  { test: /error|failed|problem/i, status: 'error' },
  { test: /verified|approved|clean/i, status: 'verified' },
  { test: /\bexpir(e|es|ing|ation)\b|ending soon|expiring soon/i, flag: 'expiringSoon' },
];

/** GET /api/documents/search */
export const searchDocuments = asyncHandler(async (request, response) => {
  const query = requireString(request.query?.q || '', 'Search query', { max: 200 });
  const documents = await db.listDocuments(request.user.id, { limit: 500 });
  const lower = query.toLowerCase();

  // ---- Parse natural-language intent ----
  const filters = { types: [], statuses: [], minAmount: null, maxAmount: null, expiringSoon: false, fileName: null };
  const interpretation = [];

  for (const [alias, type] of [
    ['invoice', 'invoice'], ['receipt', 'receipt'], ['resume', 'resume'], ['cv', 'resume'],
    ['contract', 'contract'], ['agreement', 'contract'], ['bank statement', 'bank_statement'],
    ['statement', 'bank_statement'], ['certificate', 'certificate'], ['application', 'application_form'],
  ]) {
    if (lower.includes(alias) && !filters.types.includes(type)) filters.types.push(type);
  }
  if (filters.types.length) interpretation.push(`document type: ${filters.types.join(', ')}`);

  for (const pattern of NL_PATTERNS) {
    if (pattern.test.test(query)) {
      if (pattern.status) filters.statuses.push(pattern.status);
      if (pattern.flag) filters[pattern.flag] = true;
      interpretation.push(pattern.status ? `status: ${pattern.status.replace('_', ' ')}` : 'expiring soon');
    }
  }

  const amountMatch = query.match(/(?:above|over|greater than|more than|at least|exceeds?)\s*(?:₹|rs\.?|inr|\$|usd)?\s*([\d,]+(?:\.\d{1,2})?)/i)
    || query.match(/(?:₹|rs\.?|inr|\$|usd)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:or more|\+)/i);
  if (amountMatch) {
    filters.minAmount = Number(amountMatch[1].replace(/,/g, ''));
    interpretation.push(`amount at least ${filters.minAmount}`);
  }
  const belowMatch = query.match(/(?:below|under|less than|at most|up to)\s*(?:₹|rs\.?|inr|\$|usd)?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (belowMatch) {
    filters.maxAmount = Number(belowMatch[1].replace(/,/g, ''));
    interpretation.push(`amount at most ${filters.maxAmount}`);
  }

  const nameMatch = query.match(/(?:named|called|file)\s+["']?([\w\-. ]+)["']?/i);
  if (nameMatch) filters.fileName = nameMatch[1].trim().toLowerCase();

  const now = Date.now();
  const SIX_MONTHS = 180 * 24 * 60 * 60 * 1000;
  const freeTextTerms = lower.split(/\s+/).filter((term) => term.length > 2);
  const hasStructuredFilter =
    filters.types.length > 0 ||
    filters.statuses.length > 0 ||
    filters.minAmount !== null ||
    filters.maxAmount !== null ||
    Boolean(filters.fileName) ||
    filters.expiringSoon;

  const matches = [];
  for (const document of documents) {
    if (filters.types.length && !filters.types.includes(document.document_type)) continue;
    if (filters.statuses.length && !filters.statuses.includes(document.status)) continue;
    if (filters.fileName && !document.file_name.toLowerCase().includes(filters.fileName)) continue;

    const fields = await loadFields(document.id);

    if (filters.minAmount !== null || filters.maxAmount !== null) {
      const amounts = Object.values(fields)
        .map((entry) => (typeof entry.value === 'number' ? entry.value : null))
        .filter((value) => value !== null);
      if (
        !amounts.some(
          (value) =>
            (filters.minAmount === null || value >= filters.minAmount) &&
            (filters.maxAmount === null || value <= filters.maxAmount),
        )
      ) {
        continue;
      }
    }

    if (filters.expiringSoon) {
      const endDate = fields.end_date?.value || fields.due_date?.value || fields.valid_until?.value;
      if (!endDate) continue;
      const parsed = new Date(endDate);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() < now || parsed.getTime() > now + SIX_MONTHS) continue;
    }

    const matchedFields = Object.entries(fields)
      .filter(([, entry]) => {
        const text = JSON.stringify(entry.value ?? '').toLowerCase();
        return freeTextTerms.some((term) => text.includes(term));
      })
      .slice(0, 8)
      .map(([name, entry]) => ({ field: name, value: entry.value, confidence: entry.confidence }));

    // Free-text fallback: match the file name, type or any extracted value.
    if (!hasStructuredFilter) {
      const haystack = [
        document.file_name,
        document.document_type,
        ...Object.values(fields).map((entry) => JSON.stringify(entry.value ?? '')),
      ]
        .join(' ')
        .toLowerCase();
      if (freeTextTerms.length && !freeTextTerms.some((term) => haystack.includes(term))) continue;
    }

    matches.push({ document: serializeDocument(document), matchedFields });
  }

  response.json({
    query,
    interpretation: interpretation.length
      ? interpretation.join('; ')
      : 'free-text search across file names and extracted values',
    total: matches.length,
    results: matches,
  });
});

/* ------------------------------------------------------------------ *
 * Comparison
 * ------------------------------------------------------------------ */

/** POST /api/documents/compare */
export const compareDocumentsEndpoint = asyncHandler(async (request, response) => {
  const { documentIdA, documentIdB } = request.body || {};
  if (!documentIdA || !documentIdB) {
    throw new ValidationError('Two document ids are required for a comparison.');
  }

  const [docA, docB] = await Promise.all([
    db.getDocument(request.user.id, documentIdA),
    db.getDocument(request.user.id, documentIdB),
  ]);
  assertOwnership(docA, request.user.id);
  assertOwnership(docB, request.user.id);

  const [fieldsA, fieldsB] = await Promise.all([loadFields(docA.id), loadFields(docB.id)]);
  const comparison = await compareDocuments({
    documentA: docA,
    fieldsA,
    documentB: docB,
    fieldsB,
  });

  response.json({ comparison, summary: summariseDiff(comparison.diff) });
});

/** GET /api/config - tells the UI which engines are live. */
export const getRuntimeConfig = asyncHandler(async (request, response) => {
  response.json({
    storage: storageInfo(),
    upload: {
      maxFileSizeMb: config.upload.maxFileSizeMb,
      allowedTypes: config.upload.allowedMimeTypes,
    },
  });
});

export default {
  uploadDocument,
  listDocuments,
  getDocument,
  removeDocument,
  streamDocumentFile,
  getExtractedData,
  getValidation,
  getProcessingLogs,
  getStats,
  searchDocuments,
  compareDocumentsEndpoint,
  getRuntimeConfig,
};
