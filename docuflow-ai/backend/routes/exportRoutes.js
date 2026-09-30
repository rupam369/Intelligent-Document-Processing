/**
 * Export routes.
 *   GET /api/documents/:id/export/json
 *   GET /api/documents/:id/export/csv
 *   GET /api/documents/:id/export/pdf
 *   GET /api/documents/:id/report
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/errorMiddleware.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { exportJson, exportCsv, exportPdf, getReport } from '../controllers/exportController.js';

const router = Router();

router.use(requireAuth);

router.get('/:id/export/json', asyncHandler(exportJson));
router.get('/:id/export/csv', asyncHandler(exportCsv));
router.get('/:id/export/pdf', asyncHandler(exportPdf));
router.get('/:id/report', asyncHandler(getReport));

export default router;
