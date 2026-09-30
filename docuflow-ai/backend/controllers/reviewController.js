/**
 * Human review controller.
 *
 * Documents arrive here when confidence is low, validation fails or required
 * fields are missing. A reviewer can edit, approve or reject individual fields
 * and then approve the document or mark it as needing attention.
 */
import { asyncHandler } from '../middleware/errorMiddleware.js';
import { db, assertOwnership } from '../services/database.js';
import { getSchemaFor } from '../services/extractionService.js';
import { labelForType } from '../services/classificationService.js';
import { normalizeConfidence, requireString } from '../utils/validators.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const FIELD_ACTIONS = ['approve_field', 'reject_field', 'edit_field', 'add_field'];
const DOCUMENT_ACTIONS = ['approve_document', 'needs_attention'];
const ALLOWED_ACTIONS = [...FIELD_ACTIONS, ...DOCUMENT_ACTIONS];

function parseValue(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function loadFields(documentId) {
  const rows = await db.getExtractedData(documentId);
  const fields = {};
  for (const row of rows) {
    fields[row.field_name] = { value: parseValue(row.field_value), confidence: row.confidence };
  }
  return fields;
}

/** GET /api/review/queue - documents awaiting a human decision. */
export const getReviewQueue = asyncHandler(async (request, response) => {
  const documents = await db.listDocuments(request.user.id, { limit: 500 });
  const queue = documents.filter((document) => ['needs_review', 'error', 'needs_attention'].includes(document.status));

  const items = await Promise.all(
    queue.map(async (document) => {
      const [fields, validationResults] = await Promise.all([
        loadFields(document.id),
        db.getValidationResults(document.id),
      ]);
      return {
        document: {
          id: document.id,
          fileName: document.file_name,
          documentType: document.document_type,
          documentTypeLabel: labelForType(document.document_type),
          status: document.status,
          statusReason: document.status_reason,
          classificationConfidence: document.classification_confidence,
          errorMessage: document.error_message,
          createdAt: document.created_at,
        },
        fields,
        validationResults,
      };
    }),
  );

  response.json({ total: items.length, items });
});

/** POST /api/documents/:id/review */
export const submitReview = asyncHandler(async (request, response) => {
  const document = assertOwnership(await db.getDocument(request.user.id, request.params.id), request.user.id);
  const action = requireString(request.body?.action, 'Action', { max: 40 });

  if (!ALLOWED_ACTIONS.includes(action)) {
    throw new ValidationError(`Unsupported review action "${action}".`);
  }

  const fieldName = request.body?.field ? requireString(request.body.field, 'Field', { max: 80 }) : null;
  const comment = request.body?.comment ? requireString(request.body.comment, 'Comment', { max: 1000 }) : null;
  const schema = getSchemaFor(document.document_type);

  let previousValue = null;
  let newValue = null;

  if (FIELD_ACTIONS.includes(action)) {
    if (!fieldName) throw new ValidationError('A field name is required for this action.');
    const existing = await db.getExtractedData(document.id).then((rows) =>
      rows.find((row) => row.field_name === fieldName),
    );

    if (action === 'add_field') {
      if (request.body?.value === undefined || request.body?.value === null || request.body?.value === '') {
        throw new ValidationError('A value is required when adding a field.');
      }
      newValue = request.body.value;
      if (existing) {
        previousValue = parseValue(existing.field_value);
        await db.updateExtractedField(document.id, fieldName, {
          field_value: JSON.stringify(newValue),
          confidence: 1,
          reviewed: true,
        });
      } else {
        await db.insertExtractedField(document.id, fieldName, { value: newValue, confidence: 1 });
      }
    } else {
      if (!existing) throw new NotFoundError(`Field "${fieldName}" was not found on this document.`);
      previousValue = parseValue(existing.field_value);

      if (action === 'approve_field') {
        await db.updateExtractedField(document.id, fieldName, { confidence: 1, reviewed: true });
        newValue = previousValue;
      } else if (action === 'reject_field') {
        await db.updateExtractedField(document.id, fieldName, { confidence: 0, reviewed: true, rejected: true });
        newValue = previousValue;
      } else if (action === 'edit_field') {
        if (request.body?.value === undefined || request.body?.value === null || request.body?.value === '') {
          throw new ValidationError('A new value is required when editing a field.');
        }
        newValue = request.body.value;
        await db.updateExtractedField(document.id, fieldName, {
          field_value: JSON.stringify(newValue),
          confidence: 1,
          reviewed: true,
          rejected: false,
        });
      }
    }
  }

  // ---- Document-level decisions ----
  if (DOCUMENT_ACTIONS.includes(action)) {
    const nextStatus = action === 'approve_document' ? 'verified' : 'needs_attention';
    await db.updateDocument(document.id, {
      status: nextStatus,
      status_reason:
        action === 'approve_document'
          ? 'Approved by a human reviewer.'
          : 'Flagged for further attention by a human reviewer.',
      reviewed_at: new Date().toISOString(),
      reviewed_by: request.user.id,
    });
  }

  const reviewAction = await db.createReviewAction({
    document_id: document.id,
    user_id: request.user.id,
    action,
    field_name: fieldName,
    previous_value: previousValue === null ? null : JSON.stringify(previousValue),
    new_value: newValue === null ? null : JSON.stringify(newValue),
    comment,
  });

  const updated = await db.getDocument(request.user.id, document.id);
  const fields = await loadFields(document.id);

  logger.info('Review action recorded', {
    documentId: document.id,
    userId: request.user.id,
    action,
    fieldName,
  });

  response.json({
    reviewAction: {
      id: reviewAction.id,
      action,
      fieldName,
      previousValue,
      newValue,
      comment,
      createdAt: reviewAction.created_at,
    },
    document: {
      id: updated.id,
      status: updated.status,
      statusReason: updated.status_reason,
      reviewedAt: updated.reviewed_at,
      schema: Object.keys(schema),
    },
    fields,
  });
});

/** GET /api/documents/:id/review - existing review history. */
export const getReviewHistory = asyncHandler(async (request, response) => {
  const document = assertOwnership(await db.getDocument(request.user.id, request.params.id), request.user.id);
  const actions = await db.listReviewActions(document.id);

  response.json({
    actions: actions.map((action) => ({
      id: action.id,
      action: action.action,
      fieldName: action.field_name,
      previousValue: parseValue(action.previous_value),
      newValue: parseValue(action.new_value),
      comment: action.comment,
      createdAt: action.created_at,
    })),
  });
});

export default { getReviewQueue, submitReview, getReviewHistory };
