/**
 * Auth controller - registration, sign-in, current user.
 */
import { asyncHandler } from '../middleware/errorMiddleware.js';
import { register, login, authInfo } from '../services/authService.js';
import { requireString, isValidEmail } from '../utils/validators.js';
import { ValidationError } from '../utils/errors.js';

export const registerUser = asyncHandler(async (request, response) => {
  const email = requireString(request.body?.email, 'Email', { max: 254 }).toLowerCase();
  if (!isValidEmail(email)) throw new ValidationError('Please enter a valid email address.');

  const result = await register({
    email,
    password: request.body?.password,
    fullName: request.body?.fullName,
  });

  response.status(201).json({
    user: result.user,
    session: result.session,
    confirmationRequired: Boolean(result.confirmationRequired),
    auth: authInfo(),
  });
});

export const loginUser = asyncHandler(async (request, response) => {
  const email = requireString(request.body?.email, 'Email', { max: 254 }).toLowerCase();
  const password = requireString(request.body?.password, 'Password', { max: 200 });

  const result = await login({ email, password });

  response.json({
    user: result.user,
    session: result.session,
    auth: authInfo(),
  });
});

export const currentUser = asyncHandler(async (request, response) => {
  response.json({
    user: request.user,
    auth: authInfo(),
  });
});

export const logoutUser = asyncHandler(async (request, response) => {
  // Stateless JWTs are discarded client-side; Supabase revocation is optional.
  response.json({ success: true, message: 'Signed out.' });
});

export default { registerUser, loginUser, currentUser, logoutUser };
