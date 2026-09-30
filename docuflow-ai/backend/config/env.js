/**
 * Centralised environment configuration.
 *
 * Every tunable value is read once here so the rest of the app never touches
 * `process.env` directly. Missing values degrade gracefully into DEMO MODE
 * instead of crashing, which keeps the platform runnable without any
 * external credentials.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const bool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const int = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const list = (value, fallback = []) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .concat(String(value || '').trim() ? [] : fallback);

const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction: (process.env.NODE_ENV || 'development') === 'production',
  port: int(process.env.PORT, 5000),
  corsOrigins: list(process.env.CORS_ORIGIN, ['http://localhost:5173', 'http://127.0.0.1:5173']),

  supabase: {
    url: supabaseUrl,
    anonKey: (process.env.SUPABASE_ANON_KEY || '').trim(),
    serviceRoleKey: supabaseServiceKey,
    storageBucket: (process.env.SUPABASE_STORAGE_BUCKET || 'documents').trim(),
  },

  ai: {
    provider: (process.env.AI_PROVIDER || 'mock').trim().toLowerCase(),
    apiKey: (process.env.AI_API_KEY || '').trim(),
    model: (process.env.AI_MODEL || '').trim(),
    baseUrl: (process.env.AI_BASE_URL || '').trim(),
    maxRetries: int(process.env.AI_MAX_RETRIES, 2),
    timeoutMs: int(process.env.AI_TIMEOUT_MS, 45000),
  },

  ocr: {
    provider: (process.env.OCR_PROVIDER || 'mock').trim().toLowerCase(),
    apiKey: (process.env.OCR_API_KEY || '').trim(),
    baseUrl: (process.env.OCR_BASE_URL || '').trim(),
    timeoutMs: int(process.env.OCR_TIMEOUT_MS, 45000),
  },

  upload: {
    maxFileSizeBytes: int(process.env.MAX_FILE_SIZE_MB, 15) * 1024 * 1024,
    maxFileSizeMb: int(process.env.MAX_FILE_SIZE_MB, 15),
    allowedMimeTypes: list(process.env.ALLOWED_FILE_TYPES, [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
    ]),
  },

  auth: {
    demoJwtSecret: process.env.DEMO_JWT_SECRET || 'docuflow-demo-secret',
    sessionTtlSeconds: int(process.env.SESSION_TTL_SECONDS, 604800),
  },

  pipeline: {
    /** Artificial per-stage delay so the pipeline is visible during a live demo. */
    stageDelayMs: int(process.env.PIPELINE_STAGE_DELAY_MS, 0),
  },

  logLevel: (process.env.LOG_LEVEL || 'info').trim().toLowerCase(),

  paths: {
    root: path.resolve(__dirname, '../..'),
    backend: path.resolve(__dirname, '..'),
    data: path.resolve(__dirname, '../data'),
    uploads: path.resolve(__dirname, '../data/uploads'),
  },
};

/** True when a real Supabase project is wired up. */
export const isSupabaseConfigured = () =>
  Boolean(config.supabase.url && config.supabase.serviceRoleKey);

/** True when a real (non-mock) AI provider is wired up. */
export const isAiConfigured = () =>
  config.ai.provider !== 'mock' && Boolean(config.ai.apiKey);

/** True when a real (non-mock) OCR provider is wired up. */
export const isOcrConfigured = () =>
  config.ocr.provider !== 'mock' && (config.ocr.provider === 'local-pdf' || Boolean(config.ocr.apiKey));

export const DEMO_MODE = !isSupabaseConfigured();

export default config;
