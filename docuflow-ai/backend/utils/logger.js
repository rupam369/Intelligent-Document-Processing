/**
 * Tiny structured logger.
 *
 * Deliberately dependency-free. Sensitive document content is never logged -
 * only metadata (ids, file names, stages, timings).
 */
import { config } from '../config/env.js';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

const emit = (level, message, meta = {}) => {
  if ((LEVELS[level] ?? 2) > threshold) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(Object.keys(meta).length ? meta : {}),
  };
  const serialised = JSON.stringify(line);
  if (level === 'error') console.error(serialised);
  else if (level === 'warn') console.warn(serialised);
  else console.log(serialised);
};

export const logger = {
  error: (message, meta) => emit('error', message, meta),
  warn: (message, meta) => emit('warn', message, meta),
  info: (message, meta) => emit('info', message, meta),
  debug: (message, meta) => emit('debug', message, meta),
};

/** Logs the duration of an async operation. */
export async function withTiming(label, fn, meta = {}) {
  const started = Date.now();
  try {
    const result = await fn();
    logger.debug(`${label} completed`, { ...meta, durationMs: Date.now() - started });
    return result;
  } catch (error) {
    logger.error(`${label} failed`, { ...meta, durationMs: Date.now() - started, error: error.message });
    throw error;
  }
}

export default logger;
