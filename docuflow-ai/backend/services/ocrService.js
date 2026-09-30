/**
 * OCR / Vision abstraction layer.
 *
 * Controllers never talk to an OCR vendor directly - they call `extractText()`
 * and receive a normalised payload:
 *
 *   { text, pages, blocks, provider, meta }
 *
 * Providers are selected with OCR_PROVIDER:
 *   mock            - bundled demo corpus (auto-falls back to local-pdf for
 *                     text-based PDFs so real uploads still work offline)
 *   local-pdf       - pure-Node text extraction from PDF content streams
 *   openai-vision   - GPT-4o / GPT-4.1 vision
 *   gemini-vision   - Google Gemini multimodal
 *   google-vision   - Google Cloud Vision DOCUMENT_TEXT_DETECTION
 *   azure-vision    - Azure AI Vision Read API
 */
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { UpstreamError, AppError } from '../utils/errors.js';
import { extractPdfText } from '../utils/pdfText.js';
import { getDemoDocumentForFile, unreadableDocumentText } from './demoCorpus.js';
import { extractWithVision } from './visionService.js';

const PROVIDER_LABELS = {
  mock: 'Demo OCR (offline corpus)',
  'local-pdf': 'Local PDF text extractor',
  'openai-vision': 'OpenAI Vision',
  'gemini-vision': 'Google Gemini Vision',
  'google-vision': 'Google Cloud Vision',
  'azure-vision': 'Azure AI Vision',
};

export function getOcrProviderInfo() {
  const demoMode = config.ocr.provider === 'mock';
  return {
    provider: config.ocr.provider,
    label: PROVIDER_LABELS[config.ocr.provider] || config.ocr.provider,
    demoMode,
    supportsPdf: true,
    supportsImages: !['local-pdf'].includes(config.ocr.provider),
  };
}

/** Local PDF extraction wrapped in the standard OCR payload shape. */
function localPdfExtract(buffer) {
  const result = extractPdfText(buffer);
  return {
    text: result.text,
    pages: result.pages,
    blocks: result.blocks,
    provider: 'local-pdf',
    meta: {
      textQuality: result.quality,
      scannedDocument: result.empty,
      note: result.empty
        ? 'No embedded text found - this looks like a scanned document and needs a vision OCR provider.'
        : undefined,
    },
  };
}

/** Delegates to the multimodal vision layer. */
async function visionLlmExtract({ buffer, mimeType, fileName }) {
  return extractWithVision({ buffer, mimeType, fileName });
}

async function googleVisionExtract({ buffer }) {
  const endpoint =
    config.ocr.baseUrl || 'https://vision.googleapis.com/v1/images:annotate';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': config.ocr.apiKey },
    body: JSON.stringify({
      requests: [
        {
          image: { content: buffer.toString('base64') },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        },
      ],
    }),
  });
  if (!response.ok) throw new UpstreamError('OCR provider', new Error(`HTTP ${response.status}`));
  const payload = await response.json();
  const annotation = payload.responses?.[0]?.fullTextAnnotation;
  if (!annotation?.text) {
    throw new AppError('OCR returned no text. The document may be blank or too low quality.', 422, 'ocr_empty');
  }
  return {
    text: annotation.text.trim(),
    pages: annotation.pages?.length || 1,
    blocks: (annotation.pages?.[0]?.blocks || []).map((block, index) => ({
      id: `b${index}`,
      type: 'block',
      text: block.paragraphs?.map((p) => p.words?.map((w) => w.symbols?.map((s) => s.text).join('')).join(' ')).join(' '),
      confidence: block.confidence ?? 0.9,
    })),
    provider: 'google-vision',
    meta: { textQuality: 0.95 },
  };
}

async function azureVisionExtract({ buffer }) {
  const endpoint = config.ocr.baseUrl;
  const key = config.ocr.apiKey;
  if (!endpoint) throw new AppError('Azure Vision requires OCR_BASE_URL to be set.', 500, 'ocr_misconfigured');
  const submit = await fetch(`${endpoint}/vision/v3.2/read/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', 'Ocp-Apim-Subscription-Key': key },
    body: buffer,
  });
  if (!submit.ok) throw new UpstreamError('OCR provider', new Error(`HTTP ${submit.status}`));
  const operationLocation = submit.headers.get('operation-location');
  if (!operationLocation) throw new UpstreamError('OCR provider', new Error('Missing operation location'));

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const poll = await fetch(operationLocation, { headers: { 'Ocp-Apim-Subscription-Key': key } });
    const payload = await poll.json();
    if (payload.status === 'succeeded') {
      const lines = [];
      for (const result of payload.analyzeResult?.readResults || []) {
        for (const line of result.lines || []) lines.push({ text: line.text, confidence: line.appearance?.style?.confidence ?? 0.9 });
      }
      if (!lines.length) {
        throw new AppError('OCR returned no text. The document may be blank or too low quality.', 422, 'ocr_empty');
      }
      return {
        text: lines.map((line) => line.text).join('\n'),
        pages: payload.analyzeResult?.readResults?.length || 1,
        blocks: lines.map((line, index) => ({ id: `b${index}`, type: 'line', ...line })),
        provider: 'azure-vision',
        meta: { textQuality: 0.95 },
      };
    }
    if (payload.status === 'failed') throw new UpstreamError('OCR provider', new Error('Read operation failed'));
  }
  throw new UpstreamError('OCR provider', new Error('OCR timed out'));
}

/**
 * Extracts text from an uploaded document.
 *
 * @param {{buffer: Buffer, mimeType: string, fileName: string, documentId?: string, storageUrl?: string}} input
 * @returns {Promise<{text: string, pages: number, blocks: Array, provider: string, meta: object}>}
 */
export async function extractText(input) {
  const { buffer, mimeType, fileName, documentId } = input;
  const provider = config.ocr.provider;
  const startedAt = Date.now();

  logger.info('OCR started', { documentId, fileName, provider, mimeType, sizeBytes: buffer?.length });

  try {
    let result;

    if (provider === 'mock') {
      const isPdf = mimeType === 'application/pdf';
      if (isPdf) {
        // Real text-based PDFs still get real extraction, even in demo mode.
        const local = localPdfExtract(buffer);
        if (!local.meta.scannedDocument && local.text.length > 40) {
          result = { ...local, provider: 'local-pdf', meta: { ...local.meta, demoMode: true, fallbackUsed: true } };
        }
      }
      if (!result) {
        const demo = getDemoDocumentForFile(fileName);
        if (demo) {
          result = {
            text: demo.ocrText,
            pages: demo.pages || 1,
            blocks: demo.ocrText.split('\n').filter(Boolean).map((line, index) => ({
              id: `b${index}`,
              type: 'line',
              text: line,
              confidence: 0.85,
            })),
            provider: 'mock',
            meta: {
              demoMode: true,
              demoCorpusMatch: demo.id,
              note: isPdf
                ? 'This PDF has no extractable text layer (it looks scanned), so the bundled demo corpus supplied representative content.'
                : 'The bundled demo corpus supplied representative content for this image.',
            },
          };
        } else {
          // No signal at all. Say so instead of guessing a document type.
          const reason = isPdf
            ? 'This PDF has no extractable text layer, so it looks like a scanned document.'
            : 'This is an image, which needs a vision OCR provider to read.';
          const text = unreadableDocumentText(fileName, reason);
          result = {
            text,
            pages: 1,
            blocks: text.split('\n').map((line, index) => ({ id: `b${index}`, type: 'line', text: line, confidence: 0 })),
            provider: 'mock',
            meta: {
              demoMode: true,
              unreadable: true,
              note: `${reason} Configure OCR_PROVIDER (for example openai-vision or google-vision) to read this document, or review it manually.`,
            },
          };
        }
      }
    } else if (provider === 'local-pdf') {
      if (mimeType !== 'application/pdf') {
        throw new AppError(
          'The local-pdf provider only supports PDF files. Configure a vision OCR provider for JPG/PNG.',
          400,
          'ocr_unsupported_type',
        );
      }
      result = localPdfExtract(buffer);
      if (result.meta.scannedDocument) {
        throw new AppError(
          'No text layer found in this PDF. It appears to be scanned - configure a vision OCR provider.',
          422,
          'ocr_empty',
        );
      }
    } else if (provider === 'openai-vision' || provider === 'gemini-vision') {
      result = await visionLlmExtract({ buffer, mimeType, fileName });
    } else if (provider === 'google-vision') {
      result = await googleVisionExtract({ buffer });
    } else if (provider === 'azure-vision') {
      result = await azureVisionExtract({ buffer });
    } else {
      throw new AppError(`Unknown OCR provider "${provider}".`, 500, 'ocr_misconfigured');
    }

    logger.info('OCR completed', {
      documentId,
      provider: result.provider,
      characters: result.text.length,
      pages: result.pages,
      durationMs: Date.now() - startedAt,
    });

    return result;
  } catch (error) {
    logger.error('OCR failed', { documentId, provider, error: error.message });
    throw error;
  }
}

export default { extractText, getOcrProviderInfo };
