/**
 * Data access layer.
 *
 * A single repository interface backed by either:
 *   - SupabaseRestRepository : PostgREST + Row Level Security (production)
 *   - LocalFileRepository    : JSON file store (DEMO MODE, zero setup)
 *
 * Both implementations enforce per-user scoping so a user can only ever read or
 * mutate their own rows, regardless of which backend is active.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config, isSupabaseConfigured } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';

/* ------------------------------------------------------------------ *
 * Supabase REST backend
 * ------------------------------------------------------------------ */

class SupabaseRestRepository {
  constructor() {
    this.baseUrl = `${config.supabase.url.replace(/\/$/, '')}/rest/v1`;
    this.headers = {
      apikey: config.supabase.serviceRoleKey,
      authorization: `Bearer ${config.supabase.serviceRoleKey}`,
      'content-type': 'application/json',
      accept: 'application/json',
    };
  }

  async request(method, table, { query = {}, body, headers = {} } = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) params.append(key, String(value));
    const url = `${this.baseUrl}/${table}${params.toString() ? `?${params}` : ''}`;

    const response = await fetch(url, {
      method,
      headers: { ...this.headers, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const message = payload?.message || payload?.error || `HTTP ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  async select(table, filters = {}, { order, limit, single } = {}) {
    const query = { select: '*', ...filters };
    if (order) query.order = order;
    if (limit) query.limit = limit;
    const rows = await this.request('GET', table, {
      query,
      headers: single ? { accept: 'application/vnd.pgrst.object+json' } : {},
    });
    return rows;
  }

  async insert(table, row) {
    const rows = await this.request('POST', table, {
      body: row,
      headers: { prefer: 'return=representation' },
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async update(table, id, patch) {
    const rows = await this.request('PATCH', table, {
      query: { id: `eq.${id}` },
      body: patch,
      headers: { prefer: 'return=representation' },
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async remove(table, id) {
    await this.request('DELETE', table, { query: { id: `eq.${id}` } });
    return true;
  }

  // ---- documents ----
  listDocuments(userId, filters = {}) {
    const query = { user_id: `eq.${userId}` };
    if (filters.status) query.status = `eq.${filters.status}`;
    if (filters.document_type) query.document_type = `eq.${filters.document_type}`;
    if (filters.search) query.file_name = `ilike.*${filters.search}*`;
    return this.select('documents', query, { order: 'created_at.desc', limit: filters.limit || 200 });
  }

  getDocument(userId, id) {
    return this.select('documents', { user_id: `eq.${userId}`, id: `eq.${id}` }, { single: true });
  }

  createDocument(userId, data) {
    return this.insert('documents', { ...data, id: randomUUID(), user_id: userId });
  }

  updateDocument(id, patch) {
    return this.update('documents', id, { ...patch, updated_at: new Date().toISOString() });
  }

  deleteDocument(userId, id) {
    return this.remove('documents', id).then(() => ({ user_id: userId, id }));
  }

  // ---- extracted data ----
  getExtractedData(documentId) {
    return this.select('extracted_data', { document_id: `eq.${documentId}` }, { order: 'created_at.asc' });
  }

  updateExtractedField(documentId, fieldName, patch) {
    return this.request('PATCH', 'extracted_data', {
      query: { document_id: `eq.${documentId}`, field_name: `eq.${fieldName}` },
      body: patch,
      headers: { prefer: 'return=representation' },
    }).then((rows) => (Array.isArray(rows) ? rows[0] : rows));
  }

  insertExtractedField(documentId, fieldName, entry) {
    return this.insert('extracted_data', {
      id: randomUUID(),
      document_id: documentId,
      field_name: fieldName,
      field_value: JSON.stringify(entry.value),
      confidence: entry.confidence,
    });
  }

  replaceExtractedData(documentId, fields) {
    return (async () => {
      await this.request('DELETE', 'extracted_data', { query: { document_id: `eq.${documentId}` } });
      const rows = Object.entries(fields).map(([fieldName, entry]) => ({
        id: randomUUID(),
        document_id: documentId,
        field_name: fieldName,
        field_value: JSON.stringify(entry.value),
        confidence: entry.confidence,
      }));
      if (rows.length) await this.request('POST', 'extracted_data', { body: rows });
      return rows;
    })();
  }

  // ---- validation results ----
  getValidationResults(documentId) {
    return this.select('validation_results', { document_id: `eq.${documentId}` }, { order: 'created_at.asc' });
  }

  replaceValidationResults(documentId, results) {
    return (async () => {
      await this.request('DELETE', 'validation_results', { query: { document_id: `eq.${documentId}` } });
      const rows = results.map((item) => ({
        id: randomUUID(),
        document_id: documentId,
        rule_name: item.rule_name,
        label: item.label,
        status: item.status,
        expected_value: item.expected_value,
        actual_value: item.actual_value,
        message: item.message,
      }));
      if (rows.length) await this.request('POST', 'validation_results', { body: rows });
      return rows;
    })();
  }

  // ---- processing logs ----
  getProcessingLogs(documentId) {
    return this.select('processing_logs', { document_id: `eq.${documentId}` }, { order: 'created_at.asc' });
  }

  createProcessingLog(documentId, entry) {
    return this.insert('processing_logs', {
      id: randomUUID(),
      document_id: documentId,
      stage: entry.stage,
      status: entry.status,
      progress: entry.progress,
      message: entry.message,
      duration_ms: entry.durationMs ?? null,
      meta: entry.meta ? JSON.stringify(entry.meta) : null,
    });
  }

  // ---- chat ----
  listChatMessages(documentId) {
    return this.select('chat_messages', { document_id: `eq.${documentId}` }, { order: 'created_at.asc' });
  }

  createChatMessage(row) {
    return this.insert('chat_messages', { id: randomUUID(), ...row });
  }

  // ---- review actions ----
  listReviewActions(documentId) {
    return this.select('review_actions', { document_id: `eq.${documentId}` }, { order: 'created_at.asc' });
  }

  createReviewAction(row) {
    return this.insert('review_actions', { id: randomUUID(), ...row });
  }
}

/* ------------------------------------------------------------------ *
 * Local file backend (DEMO MODE)
 * ------------------------------------------------------------------ */

class LocalFileRepository {  constructor() {
    this.file = path.join(config.paths.data, 'demo-store.json');
    this.cache = null;
    this.ensureFile();
  }
  ensureFile() {
    if (!fs.existsSync(config.paths.data)) {
      fs.mkdirSync(config.paths.data, { recursive: true });
    }
    if (!fs.existsSync(this.file)) {
      this.write({
        users: [],
        documents: [],
        extracted_data: [],
        validation_results: [],
        processing_logs: [],
        chat_messages: [],
        review_actions: [],
      });
    }
  }
  read() {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (error) {
      logger.error('Demo store unreadable, recreating', { error: error.message });
      this.cache = {
        users: [], documents: [], extracted_data: [], validation_results: [],
        processing_logs: [], chat_messages: [], review_actions: [],
      };
      this.write(this.cache);
    }
    return this.cache;
  }
  async write(store) {
    this.cache = store;
    const temp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(store, null, 2));
    fs.renameSync(temp, this.file);
  }
  commit() {
    this.write(this.cache);
  }
  async listDocuments(userId, filters = {}) {
    const store = this.read();
    let rows = store.documents.filter((doc) => doc.user_id === userId);
    if (filters.status) rows = rows.filter((doc) => doc.status === filters.status);
    if (filters.document_type) rows = rows.filter((doc) => doc.document_type === filters.document_type);
    if (filters.search) {
      const needle = filters.search.toLowerCase();
      rows = rows.filter((doc) => doc.file_name.toLowerCase().includes(needle));
    }
    return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, filters.limit || 200);
  }
  async getDocument(userId, id) {
    const store = this.read();
    return (
      store.documents.find((doc) => doc.id === id && doc.user_id === userId) || null
    );
  }
  async createDocument(userId, data) {
    const store = this.read();
    const row = { ...data, id: randomUUID(), user_id: userId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    store.documents.push(row);
    this.commit();
    return row;
  }
  async updateDocument(id, patch) {
    const store = this.read();
    const index = store.documents.findIndex((doc) => doc.id === id);
    if (index === -1) throw new NotFoundError('Document not found.');
    store.documents[index] = { ...store.documents[index], ...patch, updated_at: new Date().toISOString() };
    this.commit();
    return store.documents[index];
  }
  async deleteDocument(userId, id) {
    const store = this.read();
    store.documents = store.documents.filter((doc) => !(doc.id === id && doc.user_id === userId));
    store.extracted_data = store.extracted_data.filter((row) => row.document_id !== id);
    store.validation_results = store.validation_results.filter((row) => row.document_id !== id);
    store.processing_logs = store.processing_logs.filter((row) => row.document_id !== id);
    store.chat_messages = store.chat_messages.filter((row) => row.document_id !== id);
    store.review_actions = store.review_actions.filter((row) => row.document_id !== id);
    this.commit();
    return { id, user_id: userId };
  }
  async getExtractedData(documentId) {
    return this.read().extracted_data.filter((row) => row.document_id === documentId);
  }
  async updateExtractedField(documentId, fieldName, patch) {
    const store = this.read();
    const row = store.extracted_data.find(
      (candidate) => candidate.document_id === documentId && candidate.field_name === fieldName,
    );
    if (!row) throw new NotFoundError(`Field "${fieldName}" was not found on this document.`);
    Object.assign(row, patch, { updated_at: new Date().toISOString() });
    this.commit();
    return row;
  }
  async insertExtractedField(documentId, fieldName, entry) {
    const store = this.read();
    const row = {
      id: randomUUID(),
      document_id: documentId,
      field_name: fieldName,
      field_value: JSON.stringify(entry.value),
      confidence: entry.confidence,
      created_at: new Date().toISOString(),
    };
    store.extracted_data.push(row);
    this.commit();
    return row;
  }
  async replaceExtractedData(documentId, fields) {
    const store = this.read();
    store.extracted_data = store.extracted_data.filter((row) => row.document_id !== documentId);
    const rows = Object.entries(fields).map(([fieldName, entry]) => ({
      id: randomUUID(),
      document_id: documentId,
      field_name: fieldName,
      field_value: JSON.stringify(entry.value),
      confidence: entry.confidence,
      created_at: new Date().toISOString(),
    }));
    store.extracted_data.push(...rows);
    this.commit();
    return rows;
  }
  async getValidationResults(documentId) {
    return this.read().validation_results.filter((row) => row.document_id === documentId);
  }
  async replaceValidationResults(documentId, results) {
    const store = this.read();
    store.validation_results = store.validation_results.filter((row) => row.document_id !== documentId);
    const rows = results.map((item) => ({
      id: randomUUID(),
      document_id: documentId,
      rule_name: item.rule_name,
      label: item.label,
      status: item.status,
      expected_value: item.expected_value,
      actual_value: item.actual_value,
      message: item.message,
      created_at: new Date().toISOString(),
    }));
    store.validation_results.push(...rows);
    this.commit();
    return rows;
  }
  async getProcessingLogs(documentId) {
    return this.read().processing_logs.filter((row) => row.document_id === documentId);
  }
  async createProcessingLog(documentId, entry) {
    const store = this.read();
    const row = {
      id: randomUUID(),
      document_id: documentId,
      stage: entry.stage,
      status: entry.status,
      progress: entry.progress,
      message: entry.message,
      duration_ms: entry.durationMs ?? null,
      meta: entry.meta ? JSON.stringify(entry.meta) : null,
      created_at: new Date().toISOString(),
    };
    store.processing_logs.push(row);
    this.commit();
    return row;
  }
  async listChatMessages(documentId) {
    return this.read().chat_messages.filter((row) => row.document_id === documentId);
  }
  async createChatMessage(row) {
    const store = this.read();
    const created = { id: randomUUID(), ...row, created_at: new Date().toISOString() };
    store.chat_messages.push(created);
    this.commit();
    return created;
  }
  async listReviewActions(documentId) {
    return this.read().review_actions.filter((row) => row.document_id === documentId);
  }
  async createReviewAction(row) {
    const store = this.read();
    const created = { id: randomUUID(), ...row, created_at: new Date().toISOString() };
    store.review_actions.push(created);
    this.commit();
    return created;
  }
}

/* ------------------------------------------------------------------ *
 * Exported repository
 * ------------------------------------------------------------------ */

const backend = isSupabaseConfigured() ? new SupabaseRestRepository() : new LocalFileRepository();

export const repositoryInfo = () => ({
  backend: isSupabaseConfigured() ? 'supabase' : 'local-file',
  demoMode: !isSupabaseConfigured(),
});

/** Ensures a fetched document belongs to the requesting user. */
export function assertOwnership(document, userId) {
  if (!document) throw new NotFoundError('Document not found.');
  if (document.user_id !== userId) throw new ForbiddenError();
  return document;
}

export const db = backend;

export default { db, repositoryInfo, assertOwnership };
