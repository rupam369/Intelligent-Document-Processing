/**
 * Authentication service.
 *
 * Production : Supabase Auth (GoTrue). Access tokens issued by Supabase are
 *              verified on every request by calling /auth/v1/user.
 * Demo mode  : local user store with scrypt password hashing and HMAC-signed
 *              session tokens. Clearly labelled as DEMO MODE in the UI.
 *
 * Passwords are never logged and never returned in a response.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config, isSupabaseConfigured } from '../config/env.js';
import { logger } from '../utils/logger.js';
import {
  AuthenticationError,
  ConflictError,
  ValidationError,
  UpstreamError,
} from '../utils/errors.js';
import { isValidEmail, sanitizeText } from '../utils/validators.js';

const DEMO_USERS_FILE = () => path.join(config.paths.data, 'demo-users.json');

/* ------------------------------------------------------------------ *
 * Demo-mode user store
 * ------------------------------------------------------------------ */

const SCRYPT_KEYLEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, expected] = stored.split('$');
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  const a = Buffer.from(derived, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readDemoUsers() {
  const file = DEMO_USERS_FILE();
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

function writeDemoUsers(users) {
  fs.mkdirSync(config.paths.data, { recursive: true });
  fs.writeFileSync(file(users), JSON.stringify(users, null, 2));
}

function file(users) {
  return DEMO_USERS_FILE();
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Creates a compact HS256 JWT for demo-mode sessions. */
function signDemoToken(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const issuedAt = Math.floor(Date.now() / 1000);
  const body = base64url(
    JSON.stringify({ ...payload, iat: issuedAt, exp: issuedAt + config.auth.sessionTtlSeconds }),
  );
  const signature = crypto
    .createHmac('sha256', config.auth.demoJwtSecret)
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${header}.${body}.${signature}`;
}

/* ------------------------------------------------------------------ *
 * Supabase helpers
 * ------------------------------------------------------------------ */

function supabaseAuthUrl(suffix) {
  return `${config.supabase.url.replace(/\/$/, '')}/auth/v1${suffix}`;
}

async function supabaseAuthRequest(suffix, { method = 'POST', body, token } = {}) {
  const headers = {
    'content-type': 'application/json',
    apikey: config.supabase.anonKey || config.supabase.serviceRoleKey,
  };
  if (token) headers.authorization = `Bearer ${token}`;
  if (config.supabase.serviceRoleKey) headers.authorization = headers.authorization || `Bearer ${config.supabase.serviceRoleKey}`;

  const response = await fetch(supabaseAuthUrl(suffix), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      payload?.msg || payload?.error_description || payload?.message || `HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

/** Verifies a Supabase access token and returns the user. */
export async function verifySupabaseToken(token) {
  try {
    const user = await supabaseAuthRequest('/user', { method: 'GET', token });
    if (!user?.id) return null;
    return {
      id: user.id,
      email: user.email,
      fullName: user.user_metadata?.full_name || user.user_metadata?.fullName || null,
      provider: 'supabase',
    };
  } catch (error) {
    logger.warn('Supabase token verification failed', { status: error.status });
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Registers a new user.
 * @returns {Promise<{user: object, session: {access_token: string, expires_in: number}}>}
 */
export async function register({ email, password, fullName }) {
  const cleanEmail = sanitizeText(email, 254).toLowerCase();
  const cleanName = sanitizeText(fullName, 120);

  if (!isValidEmail(cleanEmail)) throw new ValidationError('Please enter a valid email address.');
  if (typeof password !== 'string' || password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters long.');
  }

  if (isSupabaseConfigured()) {
    try {
      const session = await supabaseAuthRequest('/signup', {
        body: { email: cleanEmail, password, data: { full_name: cleanName || cleanEmail.split('@')[0] } },
      });
      if (!session?.access_token && !session?.user) {
        // Supabase returns a user without a session when email confirmation is on.
        return {
          user: { id: session?.user?.id, email: cleanEmail, fullName: cleanName, provider: 'supabase' },
          session: null,
          confirmationRequired: true,
        };
      }
      const user = session.user || {};
      return {
        user: {
          id: user.id,
          email: user.email || cleanEmail,
          fullName: user.user_metadata?.full_name || cleanName,
          provider: 'supabase',
        },
        session: {
          access_token: session.access_token,
          expires_in: session.expires_in || config.auth.sessionTtlSeconds,
        },
      };
    } catch (error) {
      if (error.status === 422 || error.status === 400) {
        const message = /already|exists|registered|taken/i.test(error.message)
          ? 'An account with this email already exists.'
          : 'Registration failed. Please check your details and try again.';
        throw new ConflictError(message);
      }
      throw new UpstreamError('Authentication service', error);
    }
  }

  // ---- Demo mode ----
  const users = readDemoUsers();
  if (users.some((user) => user.email === cleanEmail)) {
    throw new ConflictError('An account with this email already exists.');
  }
  const user = {
    id: crypto.randomUUID(),
    email: cleanEmail,
    full_name: cleanName || cleanEmail.split('@')[0],
    password_hash: hashPassword(password),
    created_at: new Date().toISOString(),
  };
  users.push(user);
  writeDemoUsers(users);

  logger.info('Demo user registered', { userId: user.id });
  return {
    user: { id: user.id, email: user.email, fullName: user.full_name, provider: 'demo' },
    session: {
      access_token: signDemoToken({ sub: user.id, email: user.email }),
      expires_in: config.auth.sessionTtlSeconds,
    },
  };
}

/**
 * Signs a user in.
 * @returns {Promise<{user: object, session: {access_token: string, expires_in: number}}>}
 */
export async function login({ email, password }) {
  const cleanEmail = sanitizeText(email, 254).toLowerCase();

  if (!isValidEmail(cleanEmail)) throw new ValidationError('Please enter a valid email address.');
  if (typeof password !== 'string' || !password) throw new ValidationError('Password is required.');

  if (isSupabaseConfigured()) {
    try {
      const session = await supabaseAuthRequest('/token?grant_type=password', {
        body: { email: cleanEmail, password },
      });
      const user = session.user || {};
      return {
        user: {
          id: user.id,
          email: user.email || cleanEmail,
          fullName: user.user_metadata?.full_name || null,
          provider: 'supabase',
        },
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_in: session.expires_in || config.auth.sessionTtlSeconds,
        },
      };
    } catch (error) {
      if (error.status === 400 || error.status === 401 || error.status === 422) {
        throw new AuthenticationError('Email or password is incorrect.');
      }
      throw new UpstreamError('Authentication service', error);
    }
  }

  // ---- Demo mode ----
  const users = readDemoUsers();
  const user = users.find((candidate) => candidate.email === cleanEmail);
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new AuthenticationError('Email or password is incorrect.');
  }
  logger.info('Demo user signed in', { userId: user.id });
  return {
    user: { id: user.id, email: user.email, fullName: user.full_name, provider: 'demo' },
    session: {
      access_token: signDemoToken({ sub: user.id, email: user.email }),
      expires_in: config.auth.sessionTtlSeconds,
    },
  };
}

/**
 * Resolves an access token to a user, or null when it is invalid/expired.
 */
export async function resolveToken(token) {
  if (!token) return null;

  if (isSupabaseConfigured()) {
    const supabaseUser = await verifySupabaseToken(token);
    if (supabaseUser) return supabaseUser;
    // Fall through: allow a locally issued demo token during a Supabase
    // migration so existing demo accounts keep working.
  }

  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  try {
    const [encodedHeader, encodedPayload, signature] = parts;
    const expected = crypto
      .createHmac('sha256', config.auth.demoJwtSecret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    if (signature !== expected) return null;

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;

    const users = readDemoUsers();
    const user = users.find((candidate) => candidate.id === payload.sub);
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      provider: 'demo',
    };
  } catch (error) {
    logger.warn('Demo token verification failed', { error: error.message });
    return null;
  }
}

export const authInfo = () => ({
  backend: isSupabaseConfigured() ? 'supabase-auth' : 'demo-auth',
  demoMode: !isSupabaseConfigured(),
});

export default { register, login, resolveToken, verifySupabaseToken, authInfo };
