/**
 * Authentication middleware.
 *
 * Verifies the bearer token on every protected route and attaches the resolved
 * user to `req.user`. Controllers then scope every query by `req.user.id`.
 */
import { resolveToken } from '../services/authService.js';
import { AuthenticationError } from '../utils/errors.js';

/** Rejects the request unless a valid token is present. */
export async function requireAuth(request, response, next) {
  try {
    const header = request.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

    if (!token) {
      throw new AuthenticationError('Please sign in to continue.');
    }

    const user = await resolveToken(token);
    if (!user) {
      throw new AuthenticationError('Your session has expired. Please sign in again.');
    }

    request.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

/** Attaches the user when a token exists, but never blocks the request. */
export async function optionalAuth(request, _response, next) {
  try {
    const header = request.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (token) {
      const user = await resolveToken(token);
      if (user) request.user = user;
    }
  } catch {
    /* ignore - public route */
  }
  next();
}

export default { requireAuth, optionalAuth };
