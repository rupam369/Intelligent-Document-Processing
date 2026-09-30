/**
 * Processing controller - triggers and inspects the pipeline.
 */
import { asyncHandler } from '../middleware/errorMiddleware.js';
import { db, assertOwnership } from '../services/database.js';
import { processDocument, PIPELINE_STAGES } from '../services/pipelineService.js';
import { ConflictError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/** POST /api/documents/:id/process */
export const processDocumentEndpoint = asyncHandler(async (request, response) => {
  const document = assertOwnership(
    await db.getDocument(request.user.id, request.params.id),
    request.user.id,
  );

  if (document.status === 'processing') {
    throw new ConflictError('This document is already being processed.');
  }

  logger.info('Reprocessing requested', { documentId: document.id, userId: request.user.id });

  // Run synchronously here so the caller gets the final state immediately.
  const updated = await processDocument({ documentId: document.id, userId: request.user.id });

  response.json({
    document: {
      id: updated.id,
      status: updated.status,
      progress: updated.progress,
      documentType: updated.document_type,
      classificationConfidence: updated.classification_confidence,
      statusReason: updated.status_reason,
      errorMessage: updated.error_message,
    },
    message: 'Document processed successfully.',
  });
});

/** GET /api/documents/:id/status - lightweight polling endpoint. */
export const getStatus = asyncHandler(async (request, response) => {
  const document = assertOwnership(
    await db.getDocument(request.user.id, request.params.id),
    request.user.id,
  );

  const logs = await db.getProcessingLogs(document.id);
  const completedStages = [...new Set(logs.filter((log) => log.status === 'completed').map((log) => log.stage))];

  response.json({
    id: document.id,
    status: document.status,
    progress: document.progress ?? 0,
    currentStage: document.current_stage,
    stageMessage: document.stage_message,
    completedStages,
    pipeline: PIPELINE_STAGES,
    errorMessage: document.error_message,
  });
});

export default { processDocumentEndpoint, getStatus };
