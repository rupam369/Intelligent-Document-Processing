/**
 * Robust JSON parsing for model output.
 *
 * LLMs frequently wrap JSON in markdown fences or add conversational prose.
 * These helpers recover the payload without ever throwing raw model text at
 * the user.
 */

/** Removes ```json ... ``` fences and trims surrounding prose. */
export function stripCodeFences(value) {
  let text = String(value ?? '').trim();
  const fence = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  return text.replace(/^[^{\[]*/, '').replace(/[}\]]*$/, '');
}

/** Finds the outermost balanced JSON object/array in a string. */
function findBalanced(text, open, close) {
  const start = text.indexOf(open);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Removes trailing commas which strict JSON forbids. */
function removeTrailingCommas(text) {
  return text.replace(/,\s*([}\]])/g, '$1');
}

/**
 * Parses JSON from arbitrary model output.
 * @returns {{ok: true, value: any} | {ok: false, error: string}}
 */
export function parseLooseJson(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: false, error: 'Empty response' };
  }
  if (typeof raw === 'object') return { ok: true, value: raw };

  const candidates = [
    stripCodeFences(raw),
    findBalanced(String(raw), '{', '}'),
    findBalanced(String(raw), '[', ']'),
    removeTrailingCommas(stripCodeFences(raw)),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch {
      /* try next candidate */
    }
  }
  return { ok: false, error: 'Response was not valid JSON' };
}

/** Parses JSON and throws a descriptive error when it cannot be recovered. */
export function parseJsonOrThrow(raw, context = 'AI response') {
  const result = parseLooseJson(raw);
  if (!result.ok) {
    const error = new Error(`${context}: ${result.error}`);
    error.code = 'invalid_ai_json';
    throw error;
  }
  return result.value;
}

export default { stripCodeFences, parseLooseJson, parseJsonOrThrow };
