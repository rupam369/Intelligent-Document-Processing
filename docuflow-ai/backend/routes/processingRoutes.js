/**
 * Processing routes.
 *   POST /api/documents/:id/process
 *   GET  /api/documents/:id/status
 *   GET  /api/documents/:id/logs
 *   GET  /api/documents/:id/extracted-data
 *   GET  /api/documents/:id/validation
 *   GET  /api/documents/:id/review
 *   POST /api/documents/:id/review
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/errorMiddleware.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { processDocumentEndpoint, getStatus } from '../controllers/processingController.js';
import { getExtractedData, getValidation, getProcessingLogs } from '../controllers/documentController.js';
import { submitReview, getReviewHistory } from '../controllers/reviewController.js';

const router = Router();

router.use(requireAuth);

router.post('/:id/process', asyncHandler(processDocumentEndpoint));
router.get('/:id/status', asyncHandler(getStatus));
router.get('/:id/logs', asyncHandler(getProcessingLogs));
router.get('/:id/extracted-data', asyncHandler(getExtractedData));
router.get('/:id/validation', asyncHandler(getValidation));
router.get('/:id/review', asyncHandler(getReviewHistory));
router.post('/:id/review', asyncHandler(submitReview));

export default router;
