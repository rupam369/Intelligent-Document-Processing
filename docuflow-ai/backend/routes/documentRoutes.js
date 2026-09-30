/**
 * Document routes.
 *
 *   POST   /api/documents/upload
 *   GET    /api/documents
 *   GET    /api/documents/stats
 *   GET    /api/documents/search
 *   POST   /api/documents/compare
 *   GET    /api/documents/config
 *   GET    /api/documents/file/:path
 *   GET    /api/documents/:id
 *   DELETE /api/documents/:id
 *   POST   /api/documents/:id/process
 *   GET    /api/documents/:id/status
 *   GET    /api/documents/:id/extracted-data
 *   GET    /api/documents/:id/validation
 *   GET    /api/documents/:id/logs
 *   GET    /api/documents/:id/review
 *   POST   /api/documents/:id/review
 *   GET    /api/documents/:id/export/:format
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/errorMiddleware.js';
import { requireAuth, authFromHeaderOrQuery } from '../middleware/authMiddleware.js';
import { uploadSingle, uploadPair, assertValidFile } from '../middleware/uploadMiddleware.js';
import {
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
} from '../controllers/documentController.js';

const router = Router();

// All document routes require authentication.
// ---- Static-ish paths first so they are not captured by `/:id` ----
// The file route is registered before `requireAuth` because it is rendered by
// an <iframe>/<img>, which cannot send an Authorization header.
router.get('/file/:path', authFromHeaderOrQuery, asyncHandler(streamDocumentFile));

router.use(requireAuth);

router.get('/stats', asyncHandler(getStats));
router.get('/search', asyncHandler(searchDocuments));
router.get('/config', asyncHandler(getRuntimeConfig));

router.post('/upload', uploadSingle(), asyncHandler(uploadDocument));
router.post('/compare', asyncHandler(compareDocumentsEndpoint));

router.get('/', asyncHandler(listDocuments));
router.get('/:id', asyncHandler(getDocument));
router.delete('/:id', asyncHandler(removeDocument));

export default router;
