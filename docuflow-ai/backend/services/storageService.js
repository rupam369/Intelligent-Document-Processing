/**
 * Document storage abstraction.
 *
 * Production : Supabase Storage (bucket configured with SUPABASE_STORAGE_BUCKET)
 * Demo mode  : local disk under backend/data/uploads
 *
 * The rest of the app only ever deals with an opaque `storagePath`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config, isSupabaseConfigured } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { AppError, NotFoundError } from '../utils/errors.js';
import { MIME_TO_EXTENSION } from '../utils/validators.js';

const SIGNED_URL_TTL_SECONDS = 3600;

const extensionFor = (mimeType, originalName) =>
  MIME_TO_EXTENSION[mimeType] || (originalName || '').split('.').pop()?.toLowerCase() || 'bin';

export const storageInfo = () => ({
  backend: isSupabaseConfigured() ? 'supabase-storage' : 'local-disk',
  demoMode: !isSupabaseConfigured(),
  bucket: isSupabaseConfigured() ? config.supabase.storageBucket : 'data/uploads',
});

/** Stores an uploaded document and returns its storage path. */
export async function saveDocument({ buffer, mimeType, fileName, userId }) {
  const extension = extensionFor(mimeType, fileName);
  const objectPath = `${userId}/${randomUUID()}.${extension}`;

  if (isSupabaseConfigured()) {
    const url = `${config.supabase.url.replace(/\/$/, '')}/storage/v1/object/${config.supabase.storageBucket}/${objectPath}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: config.supabase.serviceRoleKey,
        authorization: `Bearer ${config.supabase.serviceRoleKey}`,
        'content-type': mimeType,
        'x-upsert': 'true',
      },
      body: buffer,
    });
    if (!response.ok) {
      const detail = await response.text();
      logger.error('Supabase Storage upload failed', { status: response.status, detail: detail.slice(0, 200) });
      throw new AppError('Could not store the document. Please try again.', 502, 'storage_error');
    }
    logger.info('Document stored in Supabase Storage', { objectPath, bytes: buffer.length });
    return { storagePath: objectPath, storageBackend: 'supabase-storage' };
  }

  const directory = path.join(config.paths.uploads, userId);
  fs.mkdirSync(directory, { recursive: true });
  const absolutePath = path.join(directory, path.basename(objectPath));
  fs.writeFileSync(absolutePath, buffer);
  logger.info('Document stored on local disk', { objectPath, bytes: buffer.length });
  return { storagePath: objectPath, storageBackend: 'local-disk' };
}

/** Reads a stored document back into memory. */
export async function readDocument(storagePath) {
  if (!storagePath) throw new NotFoundError('Document file reference is missing.');

  if (isSupabaseConfigured()) {
    const url = `${config.supabase.url.replace(/\/$/, '')}/storage/v1/object/${config.supabase.storageBucket}/${storagePath}`;
    const response = await fetch(url, {
      headers: {
        apikey: config.supabase.serviceRoleKey,
        authorization: `Bearer ${config.supabase.serviceRoleKey}`,
      },
    });
    if (!response.ok) throw new NotFoundError('Document file could not be retrieved from storage.');
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  const absolutePath = path.join(config.paths.uploads, storagePath);
  if (!fs.existsSync(absolutePath)) {
    throw new NotFoundError('Document file could not be found on disk.');
  }
  return fs.readFileSync(absolutePath);
}

/** Removes a stored document. */
export async function deleteDocument(storagePath) {
  if (!storagePath) return false;

  if (isSupabaseConfigured()) {
    const url = `${config.supabase.url.replace(/\/$/, '')}/storage/v1/object/${config.supabase.storageBucket}/${storagePath}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        apikey: config.supabase.serviceRoleKey,
        authorization: `Bearer ${config.supabase.serviceRoleKey}`,
      },
    });
    return response.ok;
  }

  const absolutePath = path.join(config.paths.uploads, storagePath);
  if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
  return true;
}

/**
 * Returns a short-lived URL for previewing the document in the browser.
 * In demo mode a backend proxy URL is returned instead.
 */
export async function getDocumentUrl(storagePath) {
  if (!isSupabaseConfigured()) {
    return `/api/documents/file/${encodeURIComponent(storagePath)}`;
  }
  const url = `${config.supabase.url.replace(/\/$/, '')}/storage/v1/object/sign/${config.supabase.storageBucket}/${storagePath}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: config.supabase.serviceRoleKey,
      authorization: `Bearer ${config.supabase.serviceRoleKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS }),
  });
  if (!response.ok) return `/api/documents/file/${encodeURIComponent(storagePath)}`;
  const payload = await response.json();
  const signedPath = payload.signedURL || payload.signedUrl;
  return signedPath ? `${config.supabase.url.replace(/\/$/, '')}/storage/v1${signedPath}` : null;
}

export default { saveDocument, readDocument, deleteDocument, getDocumentUrl, storageInfo };
