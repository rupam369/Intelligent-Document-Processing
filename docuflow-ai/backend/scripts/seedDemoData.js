/**
 * Demo data seeder (DEMO MODE only).
 *
 * Creates a demo account and runs a handful of bundled sample documents
 * through the real pipeline so the dashboard, review queue, chat and exports
 * all have something to show on a fresh install.
 *
 * Demo credentials: demo@docuflow.ai / demo1234
 */
import { config, isSupabaseConfigured } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { db } from '../services/database.js';
import { saveDocument } from '../services/storageService.js';
import { processDocument } from '../services/pipelineService.js';
import { register } from '../services/authService.js';
import { DEMO_DOCUMENTS } from '../services/demoCorpus.js';

const DEMO_EMAIL = 'demo@docuflow.ai';
const DEMO_PASSWORD = 'demo1234';

/** A minimal placeholder file - OCR in demo mode uses the bundled corpus. */
function placeholderBuffer(extension) {
  if (extension === 'pdf') return Buffer.from('%PDF-1.4\n% DocuFlow AI demo placeholder\n%%EOF\n', 'latin1');
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

const SEED_IDS = [
  'demo-invoice-1023',
  'demo-invoice-1044',
  'demo-resume-001',
  'demo-contract-001',
  'demo-bank-statement-001',
  'demo-receipt-001',
  'demo-certificate-001',
  'demo-application-001',
];

export async function seedDemoData() {
  if (isSupabaseConfigured()) {
    logger.info('Supabase is configured - skipping demo seeding');
    return { seeded: false, reason: 'supabase-configured' };
  }

  // ---- Ensure the demo account exists ----
  let demoUser;
  try {
    const result = await register({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      fullName: 'Demo Reviewer',
    });
    demoUser = result.user;
    logger.info('Demo account created', { email: DEMO_EMAIL });
  } catch (error) {
    if (!/already exists/i.test(error.message)) {
      logger.warn('Could not create the demo account', { error: error.message });
      return { seeded: false, reason: error.message };
    }
    // Existing account - resolve the id from the demo user store.
    const { resolveToken } = await import('../services/authService.js');
    const { login } = await import('../services/authService.js');
    const session = await login({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    demoUser = session.user;
  }

  const existing = await db.listDocuments(demoUser.id, { limit: 100 });
  if (existing.length >= SEED_IDS.length) {
    logger.info('Demo data already present', { documents: existing.length });
    return { seeded: false, reason: 'already-seeded', documents: existing.length };
  }

  const results = [];
  for (const demoId of SEED_IDS) {
    const demo = DEMO_DOCUMENTS.find((item) => item.id === demoId);
    if (!demo) continue;

    const extension = demo.fileName.split('.').pop();
    const mimeType = extension === 'pdf' ? 'application/pdf' : extension === 'png' ? 'image/png' : 'image/jpeg';

    const { storagePath, storageBackend } = await saveDocument({
      buffer: placeholderBuffer(extension),
      mimeType,
      fileName: demo.fileName,
      userId: demoUser.id,
    });

    const document = await db.createDocument(demoUser.id, {
      file_name: demo.fileName,
      file_path: storagePath,
      file_size: placeholderBuffer(extension).length,
      mime_type: mimeType,
      document_type: 'unknown',
      status: 'processing',
      progress: 5,
      current_stage: 'upload',
      stage_message: 'Seeding demo document...',
      storage_backend: storageBackend,
    });

    try {
      await processDocument({ documentId: document.id, userId: demoUser.id });
      const processed = await db.getDocument(demoUser.id, document.id);
      results.push({ id: document.id, fileName: demo.fileName, status: processed.status, type: processed.document_type });
    } catch (error) {
      results.push({ id: document.id, fileName: demo.fileName, status: 'error', error: error.message });
    }
  }

  logger.info('Demo data seeded', { documents: results.length });
  return { seeded: true, userId: demoUser.id, credentials: { email: DEMO_EMAIL, password: DEMO_PASSWORD }, results };
}

// Allow `npm run seed` to execute it directly.
if (process.argv[1] && process.argv[1].endsWith('seedDemoData.js')) {
  seedDemoData()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seeding failed:', error.message);
      process.exit(1);
    });
}

export default seedDemoData;
