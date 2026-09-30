/**
 * Chat routes.
 *   POST /api/documents/:id/chat
 *   GET  /api/documents/:id/chat
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/errorMiddleware.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { askQuestion, getChatHistory } from '../controllers/chatController.js';

const router = Router();

router.use(requireAuth);

router.post('/:id/chat', asyncHandler(askQuestion));
router.get('/:id/chat', asyncHandler(getChatHistory));

export default router;
