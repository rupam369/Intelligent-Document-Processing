/**
 * Global error handling.
 *
 * Every route is wrapped in `asyncHandler` so rejected promises reach this
 * middleware. Raw upstream errors, stack traces and secrets are stripped before
 * the response is sent to the browser.
 */
import { AppError, isAppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';

/** Wraps an async route handler so thrown errors flow to `next()`. */
export const asyncHandler = (handler) => (request, response, next) => {
  Promise.resolve(handler(request, response, next)).catch(next);
};

export function notFoundHandler(request, _response, next) {
  next(new AppError(`Route not found: ${request.method} ${request.originalUrl}`, 404, 'route_not_found'));
}

/** Terminal error handler. Must stay last in the middleware chain. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(error, request, response, _next) {
  let statusCode = 500;
  let code = 'internal_error';
  let message = 'Something went wrong on our side. Please try again.';
  let details;

  if (isAppError(error)) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.expose ? error.message : message;
    details = error.details;
  } else if (error?.type === 'entity.parse.failed') {
    statusCode = 400;
    code = 'invalid_json';
    message = 'The request body could not be parsed. Please send valid JSON.';
  } else if (error?.type === 'entity.too.large') {
    statusCode = 413;
    code = 'payload_too_large';
    message = 'The request body is too large.';
  } else if (error?.code === 'invalid_ai_json') {
    statusCode = 502;
    code = 'invalid_ai_json';
    message = 'The AI service returned an unreadable response. Please try again.';
  } else if (error?.status === 401 || error?.status === 403) {
    statusCode = error.status;
    code = 'upstream_auth_error';
    message = 'The configured external service rejected the request. Check your API credentials.';
  } else if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
    statusCode = 504;
    code = 'upstream_timeout';
    message = 'The external service took too long to respond. Please try again.';
  } else if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND' || error?.code === 'EAI_AGAIN') {
    statusCode = 503;
    code = 'network_error';
    message = 'A network request failed. Please check your connection and try again.';
  }

  const logMeta = {
    method: request.method,
    path: request.originalUrl,
    statusCode,
    code,
    userId: request.user?.id,
  };

  if (statusCode >= 500) {
    logger.error(error?.message || 'Unhandled error', { ...logMeta, stack: error?.stack?.split('\n').slice(0, 4) });
  } else {
    logger.warn(error?.message || 'Request rejected', logMeta);
  }

  response.status(statusCode).json({
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      ...(config.isProduction ? {} : { stack: error?.stack?.split('\n').slice(0, 5) }),
    },
  });
}

export default { asyncHandler, errorHandler, notFoundHandler };
