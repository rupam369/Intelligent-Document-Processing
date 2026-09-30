/**
 * Document comparison service.
 *
 * Compares two documents of the same type and separates:
 *   - "diff"      : concrete differences between extracted values (facts)
 *   - "analysis"  : AI-generated interpretation of what the changes mean
 *
 * The two are kept apart in the response so the UI can label them honestly.
 */
import { isAiConfigured } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { complete } from './aiClient.js';
import { parseLooseJson } from '../utils/json.js';
import { getSchemaFor } from './extractionService.js';
import { flattenValue } from './exportService.js';

/** Normalises a value for equality comparison. */
function normalise(value) {
  if (typeof value === 'number') return value.toFixed(2);
  if (Array.isArray(value)) return JSON.stringify(value.map((item) => (typeof item === 'object' ? JSON.stringify(item) : String(item))).sort());
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Only genuine numeric fields get a delta - strings like "INV-1023" must not. */
const numericCompare = (a, b) => {
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  if (a === b) return null;
  return { from: a, to: b, delta: Number((b - a).toFixed(2)) };
};

/**
 * Computes the field-level diff between two documents' extracted fields.
 * @returns {{added: Array, removed: Array, changed: Array, unchanged: string[]}}
 */
export function computeDiff(fieldsA = {}, fieldsB = {}) {
  const added = [];
  const removed = [];
  const changed = [];
  const unchanged = [];

  const allKeys = new Set([...Object.keys(fieldsA), ...Object.keys(fieldsB)]);

  for (const key of allKeys) {
    const a = fieldsA[key];
    const b = fieldsB[key];

    if (!a && b) {
      added.push({ field: key, value: b.value, confidence: b.confidence ?? null });
      continue;
    }
    if (a && !b) {
      removed.push({ field: key, value: a.value, confidence: a.confidence ?? null });
      continue;
    }
    if (normalise(a.value) === normalise(b.value)) {
      unchanged.push(key);
      continue;
    }
    const numeric = numericCompare(a.value, b.value);
    changed.push({
      field: key,
      from: a.value,
      to: b.value,
      fromConfidence: a.confidence ?? null,
      toConfidence: b.confidence ?? null,
      ...(numeric ? { numericDelta: numeric.delta, direction: numeric.delta > 0 ? 'increase' : 'decrease' } : {}),
    });
  }

  return { added, removed, changed, unchanged };
}

/** Compares two line arrays (used for clause / list comparison). */
function compareLists(listA = [], listB = []) {
  const normaliseEntry = (item) => String(item).replace(/\s+/g, ' ').trim().toLowerCase();
  const setA = new Set(listA.map(normaliseEntry));
  const setB = new Set(listB.map(normaliseEntry));
  return {
    added: listB.filter((item) => !setA.has(normaliseEntry(item))),
    removed: listA.filter((item) => !setB.has(normaliseEntry(item))),
  };
}

/** Deep comparison for array fields (clauses, transactions, items). */
function compareArrayFields(fieldsA = {}, fieldsB = {}) {
  const changes = [];
  const allKeys = new Set([...Object.keys(fieldsA), ...Object.keys(fieldsB)]);

  for (const key of allKeys) {
    const a = fieldsA[key]?.value;
    const b = fieldsB[key]?.value;
    if (!Array.isArray(a) || !Array.isArray(b)) continue;
    if (normalise(a) === normalise(b)) continue;
    changes.push({ field: key, ...compareLists(a, b) });
  }
  return changes;
}

/**
 * Compares two documents.
 * @param {{documentA: object, fieldsA: object, documentB: object, fieldsB: object}} input
 */
export async function compareDocuments({ documentA, fieldsA, documentB, fieldsB }) {
  const typeA = documentA.document_type;
  const typeB = documentB.document_type;
  const compatible = typeA === typeB;

  const diff = compatible ? computeDiff(fieldsA, fieldsB) : { added: [], removed: [], changed: [], unchanged: [] };
  const listChanges = compatible ? compareArrayFields(fieldsA, fieldsB) : [];

  const result = {
    compatible,
    reason: compatible
      ? null
      : `These documents are different types (${typeA} vs ${typeB}). Comparing them directly is not reliable.`,
    documentA: {
      id: documentA.id,
      fileName: documentA.file_name,
      documentType: typeA,
      status: documentA.status,
      createdAt: documentA.created_at,
    },
    documentB: {
      id: documentB.id,
      fileName: documentB.file_name,
      documentType: typeB,
      status: documentB.status,
      createdAt: documentB.created_at,
    },
    diff,
    listChanges,
    interpretation: null,
    engine: 'deterministic',
  };

  if (!compatible) return result;

  // ---- Optional AI interpretation, clearly separated from the facts ----
  if (isAiConfigured() && (diff.changed.length || diff.added.length || diff.removed.length)) {
    try {
      const facts = [
        ...diff.changed.map((item) => `${item.field}: ${flattenValue(item.from)} -> ${flattenValue(item.to)}`),
        ...diff.added.map((item) => `${item.field} added: ${flattenValue(item.value)}`),
        ...diff.removed.map((item) => `${item.field} removed: ${flattenValue(item.value)}`),
        ...listChanges.flatMap((change) => [
          ...change.added.map((entry) => `${change.field} added entry: ${entry}`),
          ...change.removed.map((entry) => `${change.field} removed entry: ${entry}`),
        ]),
      ].join('\n');

      const { text } = await complete({
        systemPrompt:
          'You are a document comparison assistant. Given a list of factual differences between two versions ' +
          'of the same document, explain in plain language what changed and what it might mean for the reader. ' +
          'Do not invent differences that are not listed. Keep it under 150 words. Return plain prose, no JSON.',
        userPrompt: `Document type: ${typeA}\n\nFactual differences:\n${facts}`,
        temperature: 0.2,
        maxTokens: 400,
      });
      result.interpretation = { text: text.trim(), provider: 'ai', disclaimer: 'AI-generated interpretation. Only the diff above is machine-extracted fact.' };
      result.engine = 'deterministic+ai';
    } catch (error) {
      logger.warn('Comparison interpretation failed', { error: error.message });
    }
  }

  return result;
}

/** Human-readable summary line for a comparison. */
export function summariseDiff(diff) {
  const parts = [];
  if (diff.changed.length) parts.push(`${diff.changed.length} value${diff.changed.length === 1 ? '' : 's'} changed`);
  if (diff.added.length) parts.push(`${diff.added.length} field${diff.added.length === 1 ? '' : 's'} added`);
  if (diff.removed.length) parts.push(`${diff.removed.length} field${diff.removed.length === 1 ? '' : 's'} removed`);
  return parts.length ? parts.join(', ') : 'No differences detected in the extracted fields.';
}

export default { compareDocuments, computeDiff, summariseDiff };
