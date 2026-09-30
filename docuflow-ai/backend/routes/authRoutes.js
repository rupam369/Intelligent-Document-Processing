/**
 * Authentication routes.
 *   POST /api/auth/register
 *   POST /api/auth/login
 *   GET  /api/auth/me
 *   POST /api/auth/logout
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/errorMiddleware.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import {
  registerUser,
  loginUser,
  currentUser,
  logoutUser,
} from '../controllers/authController.js';

const router = Router();

router.post('/register', asyncHandler(registerUser));
router.post('/login', asyncHandler(loginUser));
router.get('/me', requireAuth, asyncHandler(currentUser));
router.post('/logout', requireAuth, asyncHandler(logoutUser));

export default router;
