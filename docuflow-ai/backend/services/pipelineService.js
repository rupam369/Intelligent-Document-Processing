/**
 * Document processing pipeline.
 *
 * USER -> UPLOAD -> OCR -> CLASSIFY -> EXTRACT -> VALIDATE -> SCORE -> DB
 *
 * The pipeline owns all business logic; controllers only trigger it and read
 * the result. Every stage writes a processing log and advances the document's
 * progress percentage so the UI can render live status.
 */
import { db } from './database.js';
import { readDocument } from './storageService.js';
import { extractText } from './ocrService.js';
import { classifyDocument } from './classificationService.js';
import { extractData } from './extractionService.js';
import { validate, decideStatus } from './validationService.js';
import { NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';

/** Ordered pipeline stages. The frontend renders this list directly. */
export const PIPELINE_STAGES = [
  { key: 'upload', label: 'Uploading', progress: 10 },
  { key: 'ocr', label: 'OCR Processing', progress: 25 },
  { key: 'classification', label: 'Classifying', progress: 40 },
  { key: 'extraction', label: 'Extracting Data', progress: 60 },
  { key: 'validation', label: 'Validating', progress: 80 },
  { key: 'scoring', label: 'Confidence Scoring', progress: 95 },
  { key: 'complete', label: 'Completed', progress: 100 },
];

const stageMeta = (key) =>
  PIPELINE_STAGES.find((stage) => stage.key === key) || PIPELINE_STAGES[PIPELINE_STAGES.length - 1];

/**
 * Runs the full pipeline for a document.
 * @param {{documentId: string, userId: string}} input
 * @returns {Promise<object>} the updated document row
 */
export async function processDocument({ documentId, userId }) {
  const startedAt = Date.now();
  const document = await db.getDocument(userId, documentId);
  if (!document) throw new NotFoundError('Document not found.');

  await log(db, documentId, 'pipeline', 'started', 5, 'Pipeline started.');

  try {
    // ---------- Stage 1: read the stored file ----------
    await advance(documentId, 'upload', 'running', 'Reading stored document...');
    const buffer = await readDocument(document.file_path);
    const mimeType = document.mime_type || guessMimeType(document.file_name);
    await log(db, documentId, 'upload', 'completed', 10, 'Document retrieved from storage.', {
      bytes: buffer.length,
    });

    // ---------- Stage 2: OCR / Vision ----------
    await advance(documentId, 'ocr', 'running', 'Extracting text from the document...');
    const ocrStarted = Date.now();
    const ocr = await extractText({ buffer, mimeType, fileName: document.file_name, documentId });
    await log(db, documentId, 'ocr', 'completed', 25, `Extracted ${ocr.text.length} characters of text.`, {
      provider: ocr.provider,
      pages: ocr.pages,
      durationMs: Date.now() - ocrStarted,
      demoMode: Boolean(ocr.meta?.demoMode),
    });

    if (!ocr.text || ocr.text.trim().length < 10) {
      throw Object.assign(new Error('No text could be extracted from this document.'), {
        statusCode: 422,
        code: 'ocr_empty',
      });
    }

    // ---------- Stage 3: Classification ----------
    await advance(documentId, 'classification', 'running', 'Classifying document type...');
    const classification = await classifyDocument({
      ocrText: ocr.text,
      fileName: document.file_name,
    });
    await log(db, documentId, 'classification', 'completed', 40, `Classified as ${classification.document_type}.`, {
      confidence: classification.confidence,
      engine: classification.engine,
    });

    // ---------- Stage 4: Extraction ----------
    await advance(documentId, 'extraction', 'running', 'Extracting structured data...');
    const extraction = await extractData({
      ocrText: ocr.text,
      documentType: classification.document_type,
      fileName: document.file_name,
    });
    await log(db, documentId, 'extraction', 'completed', 60, `Extracted ${Object.keys(extraction.fields).length} fields.`, {
      missing: extraction.missing,
      engine: extraction.engine,
    });

    // ---------- Stage 5: Validation ----------
    await advance(documentId, 'validation', 'running', 'Running validation rules...');
    const duplicates = await findDuplicateInvoiceNumbers(
      userId,
      documentId,
      extraction.fields.invoice_number?.value,
    );
    const validation = validate({
      fields: extraction.fields,
      documentType: classification.document_type,
      context: { documentId, existingDocumentsWithNumber: duplicates },
    });
    await log(
      db,
      documentId,
      'validation',
      'completed',
      80,
      `${validation.summary.passed} checks passed, ${validation.summary.failed} failed.`,
      { summary: validation.summary },
    );

    // ---------- Stage 6: Confidence scoring + status decision ----------
    await advance(documentId, 'scoring', 'running', 'Scoring confidence and deciding status...');
    const decision = decideStatus({
      validation,
      fields: extraction.fields,
      classificationConfidence: classification.confidence,
    });
    await log(db, documentId, 'scoring', 'completed', 95, `Status set to ${decision.status}.`, {
      reason: decision.reason,
    });

    // ---------- Stage 7: Persist ----------
    await db.replaceExtractedData(documentId, extraction.fields);
    await db.replaceValidationResults(documentId, validation.results);

    const updated = await db.updateDocument(documentId, {
      document_type: classification.document_type,
      classification_confidence: classification.confidence,
      classification_alternatives: classification.alternatives || [],
      status: decision.status,
      progress: 100,
      current_stage: 'complete',
      page_count: ocr.pages,
      ocr_text: ocr.text,
      ocr_provider: ocr.provider,
      ocr_meta: {
        blocks: (ocr.blocks || []).slice(0, 200),
        textQuality: ocr.meta?.textQuality,
        note: ocr.meta?.note,
        demoMode: Boolean(ocr.meta?.demoMode),
      },
      extraction_engine: extraction.engine,
      validation_summary: validation.summary,
      missing_fields: extraction.missing,
      status_reason: decision.reason,
      processed_at: new Date().toISOString(),
      error_message: null,
    });

    await log(db, documentId, 'complete', 'completed', 100, 'Pipeline finished.', {
      totalDurationMs: Date.now() - startedAt,
      status: decision.status,
    });

    logger.info('Pipeline completed', {
      documentId,
      userId,
      documentType: classification.document_type,
      status: decision.status,
      durationMs: Date.now() - startedAt,
    });

    return updated;
  } catch (error) {
    const statusCode = error.statusCode || 500;
    await log(db, documentId, 'pipeline', 'failed', 100, error.message, {
      code: error.code || 'pipeline_error',
    }).catch(() => {});

    await db
      .updateDocument(documentId, {
        status: 'error',
        progress: 100,
        current_stage: 'error',
        error_message: error.message,
        status_reason: 'Processing failed. You can retry from the document page.',
      })
      .catch(() => {});

    logger.error('Pipeline failed', {
      documentId,
      userId,
      error: error.message,
      code: error.code,
      statusCode,
    });
    throw error;
  }
}

/** Finds other documents from the same user carrying the same invoice number. */
async function findDuplicateInvoiceNumbers(userId, documentId, invoiceNumber) {
  if (!invoiceNumber) return [];
  try {
    const documents = await db.listDocuments(userId, { limit: 500 });
    const matches = [];
    for (const doc of documents) {
      if (doc.id === documentId || doc.document_type !== 'invoice') continue;
      const rows = await db.getExtractedData(doc.id);
      const existing = rows.find((row) => row.field_name === 'invoice_number');
      if (!existing) continue;
      let value;
      try {
        value = JSON.parse(existing.field_value);
      } catch {
        value = existing.field_value;
      }
      if (String(value).trim().toLowerCase() === String(invoiceNumber).trim().toLowerCase()) {
        matches.push(doc);
      }
    }
    return matches;
  } catch (error) {
    logger.warn('Duplicate invoice check failed', { error: error.message });
    return [];
  }
}

async function advance(documentId, stageKey, status, message) {
  const meta = stageMeta(stageKey);
  await db
    .updateDocument(documentId, {
      status: 'processing',
      progress: meta.progress,
      current_stage: stageKey,
      stage_message: message,
    })
    .catch(() => {});
  await log(db, documentId, stageKey, status, meta.progress, message);
  // Optional pacing so the pipeline is visible during a live demo.
  if (config.pipeline.stageDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, config.pipeline.stageDelayMs));
  }
}

async function log(repo, documentId, stage, status, progress, message, meta) {
  return repo.createProcessingLog(documentId, { stage, status, progress, message, meta }).catch((error) => {
    logger.warn('Could not write processing log', { stage, error: error.message });
  });
}

function guessMimeType(fileName = '') {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'png') return 'image/png';
  return 'image/jpeg';
}

export default { processDocument, PIPELINE_STAGES };
