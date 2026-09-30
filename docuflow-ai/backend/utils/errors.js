/**
 * Application error types + helpers.
 *
 * Controllers throw `AppError` (or a subclass) with a safe, user-facing
 * message. The error middleware strips anything sensitive before the response
 * leaves the server.
 */

export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'internal_error', details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.expose = statusCode < 500;
  }
}

export class ValidationError extends AppError {
  constructor(message, details) {
    super(message, 400, 'validation_error', details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required.') {
    super(message, 401, 'authentication_error');
    this.name = 'AuthenticationError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this resource.') {
    super(message, 403, 'forbidden');
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found.') {
    super(message, 404, 'not_found');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists.') {
    super(message, 409, 'conflict');
    this.name = 'ConflictError';
  }
}

/** Wraps an upstream (AI / OCR / Supabase) failure into a safe message. */
export class UpstreamError extends AppError {
  constructor(service, original) {
    super(`${service} is temporarily unavailable. Please try again.`, 502, 'upstream_error');
    this.name = 'UpstreamError';
    this.service = service;
    this.original = original;
  }
}

export const isAppError = (error) => error instanceof AppError;

export default AppError;
