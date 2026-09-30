/**
 * Review routes.
 *   GET /api/review/queue - every document waiting for a human decision
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/errorMiddleware.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getReviewQueue } from '../controllers/reviewController.js';

const router = Router();

router.use(requireAuth);

router.get('/queue', asyncHandler(getReviewQueue));

export default router;
