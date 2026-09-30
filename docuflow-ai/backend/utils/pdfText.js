/**
 * Local PDF text extraction (zero external dependencies).
 *
 * This is the `local-pdf` OCR provider. It inflates the FlateDecode content
 * streams of a PDF with Node's built-in zlib and reconstructs the text shown by
 * the `Tj` / `TJ` / `'` / `"` operators, using the text-positioning operators
 * (`Td`, `TD`, `T*`, `Tm`) to infer line breaks.
 *
 * It is intentionally honest about its limits: scanned/image-only PDFs contain
 * no text operators, so the caller receives `empty: true` and can fall back to
 * a vision OCR provider or raise a human-review flag.
 */
import zlib from 'node:zlib';

/** Extracts every `stream ... endstream` payload from a PDF buffer. */
function extractStreams(buffer) {
  const streams = [];
  let index = buffer.indexOf('stream', 0);
  while (index !== -1) {
    let start = index + 6;
    if (buffer[start] === 0x0d) start += 1;
    if (buffer[start] === 0x0a) start += 1;
    const end = buffer.indexOf('endstream', start);
    if (end === -1) break;
    streams.push(buffer.subarray(start, end));
    index = buffer.indexOf('stream', end);
  }
  return streams;
}

function inflate(payload) {
  try {
    return zlib.inflateSync(payload);
  } catch {
    /* fall through */
  }
  try {
    return zlib.inflateRawSync(payload);
  } catch {
    /* fall through */
  }
  // Some producers leave the stream uncompressed.
  if (/[\x20-\x7e]/.test(payload.toString('latin1', 0, 64))) return payload;
  return null;
}

/** Decodes PDF string escapes + hex strings into plain text. */
function decodePdfString(raw) {
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (char !== '\\') {
      out += char;
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) break;
    i += 1;
    switch (next) {
      case 'n': out += '\n'; break;
      case 'r': out += '\r'; break;
      case 't': out += '\t'; break;
      case 'b': case 'f': out += ' '; break;
      case '(': out += '('; break;
      case ')': out += ')'; break;
      case '\\': out += '\\'; break;
      case '\r': if (raw[i + 1] === '\n') i += 1; break;
      case '\n': break;
      default:
        if (next >= '0' && next <= '7') {
          let octal = next;
          while (octal.length < 3 && raw[i + 1] >= '0' && raw[i + 1] <= '7') {
            octal += raw[i + 1];
            i += 1;
          }
          out += String.fromCharCode(Number.parseInt(octal, 8));
        } else {
          out += next;
        }
    }
  }
  return out;
}

/** Pulls the string tokens out of a content-stream fragment. */
function readStrings(fragment, { gapThreshold = 140 } = {}) {
  const parts = [];
  let buffer = '';
  let depth = 0;
  let pendingGap = false;

  const flush = () => {
    if (buffer) {
      parts.push({ text: decodePdfString(buffer), gapBefore: pendingGap });
      buffer = '';
      pendingGap = false;
    }
  };

  for (let i = 0; i < fragment.length; i += 1) {
    const char = fragment[i];
    if (char === '(') {
      if (depth === 0) flush();
      depth += 1;
      buffer += depth > 1 ? '(' : '';
      continue;
    }
    if (char === ')') {
      if (depth === 1) {
        flush();
        depth = 0;
        continue;
      }
      depth -= 1;
      buffer += ')';
      continue;
    }
    if (depth > 0) {
      buffer += char;
      continue;
    }
    if (char === '<' && fragment[i + 1] !== '<') {
      // Hex string
      if (depth === 0) flush();
      let hex = '';
      i += 1;
      while (i < fragment.length && fragment[i] !== '>') {
        hex += fragment[i];
        i += 1;
      }
      const cleaned = hex.replace(/[^0-9a-fA-F]/g, '');
      let text = '';
      for (let j = 0; j + 1 < cleaned.length; j += 2) {
        text += String.fromCharCode(Number.parseInt(cleaned.slice(j, j + 2), 16));
      }
      if (cleaned.length % 2 === 1) {
        text += String.fromCharCode(Number.parseInt(`${cleaned.slice(-1)}0`, 16));
      }
      parts.push({ text, gapBefore: pendingGap });
      pendingGap = false;
      continue;
    }
    if (char === '-' || (char >= '0' && char <= '9')) {
      let num = char;
      while (i + 1 < fragment.length && /[\d.\-]/.test(fragment[i + 1])) {
        num += fragment[i + 1];
        i += 1;
      }
      if (Number.parseFloat(num) <= -gapThreshold) pendingGap = true;
    }
  }
  flush();
  return parts;
}

/** Splits a content stream into text lines using positioning operators. */
function parseContentStream(content) {
  const lines = [];
  let current = '';
  let lastY = null;
  let lastX = null;

  const pushLine = () => {
    const trimmed = current.replace(/\s+/g, ' ').trim();
    if (trimmed) lines.push(trimmed);
    current = '';
  };

  const tokenizer = /\((?:\\.|[^\\()])*\)|<[0-9a-fA-F\s]+>|\[[^\]]*\]|\/(?:[A-Za-z0-9+#._-]+)|[-+]?[\d.]+|[A-Za-z'"]+|["']/g;

  let tokens = content.match(tokenizer) || [];
  // Tokenizer can't see nested parens inside arrays; fall back to a manual scan
  // for the array case so TJ kerning gaps are preserved.
  const normalised = tokens.map((token) => {
    if (token.startsWith('[')) return { type: 'array', value: token };
    if (token.startsWith('(') || token.startsWith('<')) {
      if (token.startsWith('<') && token.startsWith('<<')) return { type: 'op', value: token };
      return { type: 'string', value: token };
    }
    if (/^[-+]?[\d.]+$/.test(token)) return { type: 'number', value: token };
    if (token.startsWith('/')) return { type: 'name', value: token };
    return { type: 'op', value: token };
  });

  for (let i = 0; i < normalised.length; i += 1) {
    const token = normalised[i];
    if (token.type === 'op') {
      const op = token.value;
      if (op === 'Tj' || op === "'" || op === '"' || op === 'TJ') {
        // find the operand(s) immediately before this operator
        const operands = [];
        for (let j = i - 1; j >= 0 && operands.length < 12; j -= 1) {
          if (normalised[j].type === 'op' || normalised[j].type === 'name') break;
          operands.unshift(normalised[j]);
          if (op === 'TJ' && normalised[j].type === 'array') break;
          if (op === 'Tj' && normalised[j].type === 'string') break;
          if ((op === "'" || op === '"') && normalised[j].type === 'string') break;
        }
        for (const operand of operands) {
          if (operand.type === 'array') {
            const parts = readStrings(operand.value.slice(1, -1));
            for (const part of parts) {
              if (part.gapBefore && current && !current.endsWith(' ')) current += ' ';
              current += part.text;
            }
          } else if (operand.type === 'string') {
            current += decodePdfString(operand.value.slice(1, -1));
          }
        }
      } else if (op === 'Td' || op === 'TD' || op === 'T*' || op === 'Tm') {
        const numbers = [];
        for (let j = i - 1; j >= 0 && numbers.length < 6; j -= 1) {
          if (normalised[j].type !== 'number') break;
          numbers.unshift(Number.parseFloat(normalised[j].value));
        }
        let y = lastY;
        let x = lastX;
        if (op === 'Tm' && numbers.length >= 6) {
          [, , , , x, y] = numbers;
        } else if ((op === 'Td' || op === 'TD') && numbers.length >= 2) {
          x = (lastX ?? 0) + numbers[0];
          y = (lastY ?? 0) + numbers[1];
        } else if (op === 'T*') {
          y = (lastY ?? 0) - 12;
        }
        const movedDown = y !== null && lastY !== null && y < lastY - 2;
        const movedRight = x !== null && lastX !== null && x > lastX + 20;
        if (movedDown || movedRight) pushLine();
        if (y !== null) lastY = y;
        if (x !== null) lastX = x;
      } else if (op === 'BT' || op === 'ET') {
        if (op === 'ET') pushLine();
      }
    }
  }
  pushLine();
  return lines;
}

function countPages(buffer, text) {
  const countMatch = buffer.toString('latin1').match(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/);
  if (countMatch) return Number.parseInt(countMatch[1], 10);
  const pageMatches = text.match(/\/Type\s*\/Page[^s]/g);
  if (pageMatches) return pageMatches.length;
  const raw = buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g);
  return raw ? raw.length : 1;
}

/** How much of the extracted text looks like real human language. */
function readabilityScore(text) {
  if (!text) return 0;
  const sample = text.slice(0, 4000);
  const letters = (sample.match(/[A-Za-z]/g) || []).length;
  const spaces = (sample.match(/\s/g) || []).length;
  const printable = (sample.match(/[\x20-\x7e]/g) || []).length;
  if (!sample.length) return 0;
  return (letters + spaces) / printable;
}

/**
 * Extracts text from a PDF buffer.
 * @returns {{text: string, pages: number, blocks: Array, empty: boolean, quality: number, provider: string}}
 */
export function extractPdfText(buffer) {
  const streams = extractStreams(buffer);
  const allLines = [];

  for (const stream of streams) {
    const decoded = inflate(stream);
    if (!decoded) continue;
    const content = decoded.toString('latin1');
    if (!/\b(Tj|TJ|BT)\b/.test(content)) continue;
    const lines = parseContentStream(content);
    if (lines.length) allLines.push(...lines);
  }

  const text = allLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const pages = countPages(buffer, text);
  const quality = readabilityScore(text);

  const blocks = allLines.slice(0, 400).map((line, index) => ({
    id: `b${index}`,
    type: 'line',
    text: line,
    confidence: quality > 0.75 ? 0.99 : 0.6,
  }));

  return {
    text,
    pages,
    blocks,
    empty: text.length === 0,
    quality: Number(quality.toFixed(3)),
    provider: 'local-pdf',
  };
}

export default extractPdfText;
