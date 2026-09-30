/**
 * Export controller - JSON, CSV and PDF report downloads.
 */
import { asyncHandler } from '../middleware/errorMiddleware.js';
import { db, assertOwnership } from '../services/database.js';
import {
  buildJsonExport,
  buildCsvExport,
  buildPdfExport,
  safeFileName,
} from '../services/exportService.js';
import { labelForType } from '../services/classificationService.js';

/** Loads everything an export needs for one document. */
async function loadExportPayload(userId, documentId) {
  const document = assertOwnership(await db.getDocument(userId, documentId), userId);

  const [rows, validationResults, reviewActions, chatMessages] = await Promise.all([
    db.getExtractedData(document.id),
    db.getValidationResults(document.id),
    db.listReviewActions(document.id),
    db.listChatMessages(document.id),
  ]);

  const fields = {};
  for (const row of rows) {
    let value = row.field_value;
    try {
      value = JSON.parse(row.field_value);
    } catch {
      /* keep the raw string */
    }
    fields[row.field_name] = { value, confidence: row.confidence, unit: undefined };
  }

  return { document, fields, validationResults, reviewActions, chatMessages };
}

/** GET /api/documents/:id/export/json */
export const exportJson = asyncHandler(async (request, response) => {
  const payload = await loadExportPayload(request.user.id, request.params.id);
  const body = buildJsonExport(payload);

  response.setHeader('content-disposition', `attachment; filename="${safeFileName(payload.document.file_name, 'json')}"`);
  response.setHeader('content-type', 'application/json');
  response.json(body);
});

/** GET /api/documents/:id/export/csv */
export const exportCsv = asyncHandler(async (request, response) => {
  const payload = await loadExportPayload(request.user.id, request.params.id);
  const csv = buildCsvExport(payload);

  response.setHeader('content-disposition', `attachment; filename="${safeFileName(payload.document.file_name, 'csv')}"`);
  response.setHeader('content-type', 'text/csv; charset=utf-8');
  response.send(csv);
});

/** GET /api/documents/:id/export/pdf */
export const exportPdf = asyncHandler(async (request, response) => {
  const payload = await loadExportPayload(request.user.id, request.params.id);
  const pdf = buildPdfExport(payload);

  response.setHeader('content-disposition', `attachment; filename="${safeFileName(payload.document.file_name, 'pdf')}"`);
  response.setHeader('content-type', 'application/pdf');
  response.setHeader('content-length', pdf.length);
  response.send(pdf);
});

/** GET /api/documents/:id/report - a JSON payload for the on-screen report. */
export const getReport = asyncHandler(async (request, response) => {
  const payload = await loadExportPayload(request.user.id, request.params.id);
  response.json({
    document: {
      ...payload.document,
      documentTypeLabel: labelForType(payload.document.document_type),
    },
    report: buildJsonExport(payload),
  });
});

export default { exportJson, exportCsv, exportPdf, getReport };
