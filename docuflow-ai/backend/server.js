/**
 * DocuFlow AI - Express API server.
 *
 * MVC layout:
 *   routes     -> URL wiring only
 *   controllers-> request/response shaping (thin)
 *   services   -> business logic (OCR, AI, validation, export, ...)
 *   middleware -> auth, uploads, errors
 */
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { config, isSupabaseConfigured, isAiConfigured, isOcrConfigured } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorMiddleware.js';
import { logger } from './utils/logger.js';
import { getOcrProviderInfo } from './services/ocrService.js';
import { getProviderInfo } from './services/aiClient.js';
import { repositoryInfo } from './services/database.js';
import { storageInfo } from './services/storageService.js';
import { authInfo } from './services/authService.js';
import { seedDemoData } from './scripts/seedDemoData.js';

import authRoutes from './routes/authRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import processingRoutes from './routes/processingRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import exportRoutes from './routes/exportRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

// ---- CORS ----
// The browser sends an `Origin` header on every non-GET request, including
// same-origin POSTs. When the app is served through a sandbox/preview host that
// origin is not in the allowlist, so development reflects any origin instead.
// Production keeps the strict CORS_ORIGIN allowlist.
const isDev = !config.isProduction;

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header (curl, server-to-server, same-origin GET) - allow.
      if (!origin) return callback(null, true);
      if (config.corsOrigins.includes(origin)) return callback(null, true);
      // Development / preview hosts (localhost, 127.0.0.1, sandbox proxies).
      if (isDev) return callback(null, true);
      return callback(new Error(`Origin ${origin} is not allowed by CORS.`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization'],
    maxAge: 600,
  }),
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// ---- Health + capability discovery ----
app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'docuflow-ai-backend',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.get('/api/capabilities', (_request, response) => {
  const database = repositoryInfo();
  const storage = storageInfo();
  const auth = authInfo();
  const ai = getProviderInfo();
  const ocr = getOcrProviderInfo();

  response.json({
    database,
    storage,
    auth,
    ai,
    ocr,
    demoMode: database.demoMode || ai.demoMode || ocr.demoMode,
    upload: {
      maxFileSizeMb: config.upload.maxFileSizeMb,
      allowedTypes: config.upload.allowedMimeTypes,
    },
  });
});

// ---- API routes ----
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/documents', processingRoutes);
app.use('/api/documents', chatRoutes);
app.use('/api/documents', exportRoutes);
app.use('/api/review', reviewRoutes);

// ---- 404 + central error handler ----
app.use(notFoundHandler);
app.use(errorHandler);

// ---- Bootstrap ----
async function start() {
  fs.mkdirSync(config.paths.uploads, { recursive: true });

  // In demo mode, make sure there is something to look at on first run.
  if (!isSupabaseConfigured()) {
    await seedDemoData().catch((error) => {
      logger.warn('Demo seeding skipped', { error: error.message });
    });
  }

  app.listen(config.port, '0.0.0.0', () => {
    const database = repositoryInfo();
    const ai = getProviderInfo();
    const ocr = getOcrProviderInfo();

    logger.info('DocuFlow AI backend started', {
      port: config.port,
      env: config.env,
      database: database.backend,
      storage: storageInfo().backend,
      auth: authInfo().backend,
      ai: ai.provider,
      ocr: ocr.provider,
    });

    const banner = [
      '',
      '  ╔══════════════════════════════════════════════════════════╗',
      '  ║            DocuFlow AI - Backend API                     ║',
      '  ╠══════════════════════════════════════════════════════════╣',
      `  ║  URL        : http://localhost:${config.port}`.padEnd(59) + '║',
      `  ║  Database   : ${database.backend}${database.demoMode ? ' (DEMO MODE)' : ''}`.padEnd(59) + '║',
      `  ║  Storage    : ${storageInfo().backend}`.padEnd(59) + '║',
      `  ║  Auth       : ${authInfo().backend}`.padEnd(59) + '║',
      `  ║  AI engine  : ${ai.provider}${ai.demoMode ? ' (DEMO MODE)' : ''}`.padEnd(59) + '║',
      `  ║  OCR engine : ${ocr.provider}${ocr.demoMode ? ' (DEMO MODE)' : ''}`.padEnd(59) + '║',
      '  ╚══════════════════════════════════════════════════════════╝',
      '',
    ];
    console.log(banner.join('\n'));

    if (database.demoMode || ai.demoMode || ocr.demoMode) {
      logger.warn('Running in DEMO MODE', {
        reason: 'Supabase credentials and/or AI/OCR keys are not configured.',
        hint: 'Copy .env.example to .env and fill in your keys to switch to production engines.',
      });
    }
  });
}

start().catch((error) => {
  logger.error('Server failed to start', { error: error.message, stack: error.stack });
  process.exit(1);
});

// ---- Graceful shutdown ----
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    logger.info('Shutting down', { signal });
    process.exit(0);
  });
}

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
});

export default app;
