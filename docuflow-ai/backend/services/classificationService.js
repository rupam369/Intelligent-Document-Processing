/**
 * AI document classification.
 *
 * Turns raw OCR text into one of the supported document types plus a
 * confidence score. The result is persisted on the documents row.
 */
import { config, isAiConfigured } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { completeJson } from './aiClient.js';
import { parseLooseJson } from '../utils/json.js';
import { normalizeConfidence } from '../utils/validators.js';

export const DOCUMENT_TYPES = [
  'invoice',
  'receipt',
  'resume',
  'contract',
  'bank_statement',
  'certificate',
  'application_form',
  'other',
];

const TYPE_LABELS = {
  invoice: 'Invoice',
  receipt: 'Receipt',
  resume: 'Resume',
  contract: 'Contract',
  bank_statement: 'Bank Statement',
  certificate: 'Certificate',
  application_form: 'Application Form',
  other: 'Other',
};

export const labelForType = (type) => TYPE_LABELS[type] || 'Other';

/** Weighted keyword signals used by the offline heuristic classifier. */
const SIGNALS = {
  invoice: {
    strong: ['tax invoice', 'invoice no', 'invoice number', 'bill to', 'billed to', 'gstin', 'subtotal', 'due date'],
    weak: ['invoice', 'total amount', 'gst', 'cgst', 'sgst', 'vendor', 'payment terms'],
  },
  receipt: {
    strong: ['receipt', 'cashier', 'paid by upi', 'thank you, visit again', 'store #'],
    weak: ['subtotal', 'total:', 'pos', 'qty'],
  },
  resume: {
    strong: ['professional summary', 'technical skills', 'work experience', 'curriculum vitae', 'linkedin.com/in', 'github.com'],
    weak: ['education', 'experience', 'projects', 'certifications', 'cgpa', 'resume'],
  },
  contract: {
    strong: ['this agreement', 'master services agreement', 'entered into', 'governing law', 'whereas', 'indemnif', 'termination notice', 'scope of services'],
    weak: ['agreement', 'clause', 'parties', 'confidential', 'liability', 'term'],
  },
  bank_statement: {
    strong: ['statement of account', 'statement period', 'opening balance', 'closing balance', 'account number', 'branch'],
    weak: ['debit', 'credit', 'balance', 'transaction', 'ifsc'],
  },
  certificate: {
    strong: ['certificate of', 'this is to certify', 'has successfully completed', 'certificate id', 'verified at'],
    weak: ['certificate', 'awarded', 'issued by', 'valid until'],
  },
  application_form: {
    strong: ['application form', 'applicant name', 'date of birth', 'startup name', 'problem statement', 'solution summary', 'funding sought'],
    weak: ['application', 'form', 'submitted on', 'team size'],
  },
};

/** Offline heuristic classifier - the DEMO MODE engine. */
export function heuristicClassify(ocrText = '') {
  const text = ocrText.toLowerCase();
  const scores = {};

  for (const type of Object.keys(SIGNALS)) {
    let score = 0;
    for (const keyword of SIGNALS[type].strong) {
      if (text.includes(keyword)) score += 3;
    }
    for (const keyword of SIGNALS[type].weak) {
      if (text.includes(keyword)) score += 1;
    }
    scores[type] = score;
  }

  const ranked = Object.entries(scores)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);

  if (!ranked.length) {
    return {
      document_type: 'other',
      confidence: 0.3,
      alternatives: [],
      reasoning: 'No recognisable document signals were found in the extracted text.',
      engine: 'heuristic',
    };
  }

  const [topType, topScore] = ranked[0];
  const runnerUp = ranked[1] ? ranked[1][1] : 0;
  // Margin-based confidence: a wide lead over the runner-up means high certainty.
  const margin = (topScore - runnerUp) / topScore;
  const strength = Math.min(topScore / 9, 1);
  const confidence = normalizeConfidence(0.55 + 0.3 * strength + 0.15 * margin);

  return {
    document_type: topType,
    confidence: Number(confidence.toFixed(2)),
    alternatives: ranked.slice(1, 3).map(([type, score]) => ({
      document_type: type,
      confidence: Number((score / topScore).toFixed(2)),
    })),
    reasoning: `Matched ${topScore} document signals for ${TYPE_LABELS[topType]}.`,
    engine: 'heuristic',
  };
}

const CLASSIFICATION_SYSTEM_PROMPT = `You are a document classification engine for an intelligent document processing platform.
Classify the document into exactly one of these types:
${DOCUMENT_TYPES.join(', ')}

Respond with JSON only, in this exact shape:
{
  "document_type": "invoice",
  "confidence": 0.97,
  "alternatives": [{"document_type": "receipt", "confidence": 0.12}],
  "reasoning": "short explanation of the deciding signals"
}

Rules:
- "confidence" is a number between 0 and 1 reflecting how certain you are.
- Use "other" when nothing matches well and set confidence below 0.5.
- Never invent a document type outside the list.`;

/**
 * Classifies a document from its OCR text.
 * @param {{ocrText: string, fileName?: string}} input
 * @returns {Promise<{document_type: string, confidence: number, alternatives: Array, reasoning?: string, engine: string}>}
 */
export async function classifyDocument({ ocrText, fileName }) {
  if (!isAiConfigured()) {
    const result = heuristicClassify(ocrText);
    logger.info('Classification (demo engine)', { fileName, ...result });
    return result;
  }

  try {
    const { parsed } = await completeJson({
      systemPrompt: CLASSIFICATION_SYSTEM_PROMPT,
      userPrompt: `File name: ${fileName || 'unknown'}\n\nDocument text (first 6000 characters):\n${ocrText.slice(0, 6000)}`,
      parse: parseLooseJson,
      maxTokens: 700,
    });

    const rawType = String(parsed.document_type || 'other').toLowerCase().replace(/[\s-]+/g, '_');
    const documentType = DOCUMENT_TYPES.includes(rawType) ? rawType : 'other';

    return {
      document_type: documentType,
      confidence: normalizeConfidence(parsed.confidence, 0.6),
      alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives.slice(0, 3) : [],
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning.slice(0, 300) : undefined,
      engine: config.ai.provider,
    };
  } catch (error) {
    logger.warn('AI classification failed, using heuristic fallback', { error: error.message });
    return { ...heuristicClassify(ocrText), fallbackUsed: true };
  }
}

export default { classifyDocument, heuristicClassify, DOCUMENT_TYPES, labelForType };
