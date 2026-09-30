/**
 * Document-grounded AI chat.
 *
 * Every answer is built from the document's extracted fields plus its OCR text.
 * If the answer cannot be supported by that content the service replies with a
 * neutral "I couldn't find that information in the document." rather than
 * guessing.
 */
import { config, isAiConfigured } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { complete } from './aiClient.js';
import { getSchemaFor } from './extractionService.js';
import { parseLooseJson } from '../utils/json.js';
import { sanitizeText } from '../utils/validators.js';

const NOT_FOUND_ANSWER = "I couldn't find that information in the document.";

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'of', 'for', 'in', 'on', 'at', 'to', 'and', 'or',
  'what', 'who', 'when', 'where', 'which', 'how', 'much', 'many', 'does', 'do', 'did', 'this',
  'that', 'these', 'those', 'it', 'its', 'me', 'my', 'show', 'tell', 'give', 'please', 'can',
  'you', 'about', 'from', 'with', 'document', 'value', 'amount',
]);

/** Question keyword -> extracted field aliases. */
const FIELD_ALIASES = {
  total: ['total', 'grand total', 'total amount', 'amount due', 'balance due'],
  subtotal: ['subtotal', 'sub total', 'net amount'],
  tax: ['tax', 'vat'],
  gst: ['gst', 'goods and services tax'],
  invoice_number: ['invoice number', 'invoice no', 'invoice #', 'bill number'],
  invoice_date: ['invoice date', 'bill date', 'date of invoice', 'issued on'],
  due_date: ['due date', 'payment due', 'pay by', 'deadline'],
  customer_name: ['customer', 'client', 'billed to', 'bill to', 'buyer', 'purchaser'],
  vendor_name: ['vendor', 'seller', 'supplier', 'from', 'issued by', 'merchant'],
  address: ['address', 'billing address', 'location of customer'],
  currency: ['currency'],
  name: ['name', 'full name', 'candidate name', 'applicant name', 'recipient'],
  email: ['email', 'e-mail', 'mail'],
  phone: ['phone', 'phone number', 'mobile', 'contact number', 'telephone'],
  location: ['location', 'city', 'address', 'based in'],
  skills: ['skills', 'technologies', 'tech stack', 'expertise'],
  education: ['education', 'degree', 'qualification', 'university', 'college'],
  experience: ['experience', 'work history', 'employment', 'roles'],
  projects: ['projects', 'portfolio'],
  parties: ['parties', 'party', 'who is involved', 'signatories', 'contractor', 'consultant'],
  start_date: ['start date', 'commences', 'begins', 'effective date', 'start of contract'],
  end_date: ['end date', 'expiry', 'expires', 'expire', 'expiration', 'finish', 'end of contract', 'terminate'],
  payment_amount: ['payment amount', 'payment', 'fees', 'retainer', 'compensation', 'salary', 'how much'],
  payment_frequency: ['payment frequency', 'how often', 'payment terms'],
  termination_notice: ['termination notice', 'notice period', 'cancellation notice'],
  important_clauses: ['clauses', 'important clauses', 'key terms', 'terms and conditions'],
  account_holder: ['account holder', 'account name', 'whose account'],
  account_number_masked: ['account number', 'account no'],
  statement_period: ['statement period', 'period covered', 'billing period'],
  transactions: ['transactions', 'transaction list', 'debits', 'credits', 'payments list'],
  opening_balance: ['opening balance', 'starting balance', 'beginning balance'],
  closing_balance: ['closing balance', 'ending balance', 'final balance'],
  merchant_name: ['merchant', 'store', 'shop', 'retailer'],
  receipt_number: ['receipt number', 'receipt no', 'receipt #'],
  date: ['date', 'when', 'purchase date', 'transaction date'],
  items: ['items', 'line items', 'products', 'purchases'],
  payment_method: ['payment method', 'paid by', 'paid with', 'mode of payment'],
  issuer: ['issuer', 'issued by', 'organisation', 'authority'],
  issue_date: ['issue date', 'issued on', 'date of issue'],
  certificate_id: ['certificate id', 'certificate number', 'credential id'],
  valid_until: ['valid until', 'validity', 'expiry', 'expires'],
  certificate_title: ['certificate title', 'title', 'certification name'],
  applicant_name: ['applicant name', 'applicant'],
  date_of_birth: ['date of birth', 'dob', 'birthday'],
  organisation_name: ['organisation', 'organization', 'startup', 'company'],
  amount_requested: ['amount requested', 'funding sought', 'funding', 'investment sought'],
  submitted_on: ['submitted on', 'submission date', 'applied on'],
};

const SUMMARY_TRIGGERS = ['summarise', 'summarize', 'summary', 'overview', 'what is this', 'what does this document say', 'explain this'];

/** Formats a single structured record (party, transaction, ...) for reading aloud. */
function formatRecord(item) {
  if (item === null || item === undefined) return '';
  if (typeof item !== 'object') return String(item);

  // Parties: "Lumen Labs (Client)"
  if (item.name && item.role) return `${item.name} (${item.role})`;
  if (item.name) return String(item.name);

  // Transactions: "03/09/2026 - Salary Credit: credit 285,000, balance 330,200"
  const parts = [];
  if (item.date) parts.push(String(item.date));
  if (item.description) parts.push(String(item.description));
  const money = [];
  if (item.debit) money.push(`debit ${item.debit}`);
  if (item.credit) money.push(`credit ${item.credit}`);
  if (item.balance !== undefined && item.balance !== null) money.push(`balance ${item.balance}`);
  const head = parts.join(' - ');
  return money.length ? `${head}: ${money.join(', ')}` : head;
}

/** Long lists are summarised so chat answers stay readable. */
const MAX_LIST_ITEMS = 5;

function joinList(rendered) {
  if (rendered.length === 1) return rendered[0];
  return `${rendered.slice(0, -1).join(', ')} and ${rendered[rendered.length - 1]}`;
}

/** Formats a field value into a human-readable string. */
function formatValue(value, documentType) {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) {
    if (!value.length) return null;
    if (typeof value[0] === 'object') {
      const rendered = value.map(formatRecord).filter(Boolean);
      if (rendered.length > MAX_LIST_ITEMS) {
        return `${joinList(rendered.slice(0, MAX_LIST_ITEMS))} (and ${rendered.length - MAX_LIST_ITEMS} more)`;
      }
      return joinList(rendered);
    }
    if (value.length > MAX_LIST_ITEMS) {
      return `${joinList(value.slice(0, MAX_LIST_ITEMS).map(String))} (and ${value.length - MAX_LIST_ITEMS} more)`;
    }
    return joinList(value.map(String));
  }
  if (typeof value === 'object') return formatRecord(value);
  return String(value);
}

/** Adds a thousands separator + currency prefix to numeric money fields. */
function formatMoney(value, currency = 'INR') {
  if (typeof value !== 'number') return String(value);
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '₹';
  return `${symbol}${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Builds a grounded context object from a processed document.
 * @returns {{facts: Array<{field: string, label: string, text: string}>, ocrText: string, documentType: string}}
 */
export function buildContext({ document, fields, ocrText = '' }) {
  const schema = getSchemaFor(document?.document_type || 'other');
  const currency = String(fields.currency?.value || 'INR');

  const facts = [];
  for (const [name, entry] of Object.entries(fields || {})) {
    const spec = schema[name] || { label: name };
    if (entry?.value === null || entry?.value === undefined || entry?.value === '') continue;
    let text;
    if (entry.unit === 'currency' || (typeof entry.value === 'number' && /amount|total|subtotal|tax|gst|balance/i.test(name))) {
      text = `${spec.label}: ${formatMoney(entry.value, currency)}`;
    } else {
      text = `${spec.label}: ${formatValue(entry.value, document?.document_type)}`;
    }
    facts.push({
      field: name,
      label: spec.label || name,
      text,
      value: entry.value,
      confidence: entry.confidence ?? 1,
    });
  }

  const lines = (ocrText || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 3);

  return { facts, ocrText, lines, documentType: document?.document_type || 'other', currency };
}

function tokenize(question) {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

/** Finds the extracted field that best matches the question. */
function matchField(question, context) {
  const normalised = ` ${question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ')} `;

  let best = null;
  let bestScore = 0;

  for (const fact of context.facts) {
    const aliases = FIELD_ALIASES[fact.field] || [fact.field.replace(/_/g, ' '), fact.label.toLowerCase()];
    for (const alias of aliases) {
      if (normalised.includes(` ${alias} `) || normalised.includes(`${alias} `) || normalised.includes(alias)) {
        // Longer alias matches are more specific and win.
        const score = alias.length + (normalised.includes(` ${alias} `) ? 5 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = fact;
        }
      }
    }
  }
  return best ? { fact: best, score: bestScore } : null;
}

/** Searches the raw OCR lines for the question's keywords. */
function matchOcrLine(question, context) {
  const tokens = tokenize(question);
  if (!tokens.length) return null;

  let best = null;
  let bestScore = 0;
  for (const line of context.lines) {
    const lower = line.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (lower.includes(token)) score += token.length;
    }
    if (score > bestScore) {
      bestScore = score;
      best = line;
    }
  }
  return best && bestScore >= 8 ? { line: best, score: bestScore } : null;
}

function buildSummary(context) {
  const keyFacts = context.facts.slice(0, 8);
  if (!keyFacts.length) return NOT_FOUND_ANSWER;
  const intro = `This document has been classified as a ${String(context.documentType).replace(/_/g, ' ')}.`;
  const details = keyFacts.map((fact) => fact.text).join('; ');
  return `${intro} Key details: ${details}.`;
}

/**
 * Offline grounded answering engine (DEMO MODE).
 * @returns {{answer: string, grounded: boolean, source: 'extracted_field'|'ocr_line'|'summary'|'none', confidence: number}}
 */
export function heuristicAnswer(question, context) {
  const lower = question.toLowerCase().trim();

  if (SUMMARY_TRIGGERS.some((trigger) => lower.includes(trigger))) {
    return { answer: buildSummary(context), grounded: true, source: 'summary', confidence: 0.9 };
  }

  const fieldMatch = matchField(question, context);
  if (fieldMatch && fieldMatch.score >= 4) {
    const verb = Array.isArray(fieldMatch.fact.value) ? 'are' : 'is';
    return {
      answer: `The ${fieldMatch.fact.label.toLowerCase()} ${verb} ${fieldMatch.fact.text.split(': ').slice(1).join(': ')}.`,
      grounded: true,
      source: 'extracted_field',
      confidence: Math.min(0.98, 0.6 + fieldMatch.fact.confidence * 0.4),
    };
  }

  const lineMatch = matchOcrLine(question, context);
  if (lineMatch) {
    return {
      answer: `Based on the document: "${lineMatch.line}".`,
      grounded: true,
      source: 'ocr_line',
      confidence: 0.7,
    };
  }

  return { answer: NOT_FOUND_ANSWER, grounded: false, source: 'none', confidence: 0 };
}

/* ------------------------------------------------------------------ *
 * AI-powered answering
 * ------------------------------------------------------------------ */

const CHAT_SYSTEM_PROMPT = `You are DocuFlow AI, an assistant that answers questions about ONE uploaded document.

STRICT GROUNDING RULES:
1. Answer ONLY from the DOCUMENT CONTEXT provided below. Never use outside knowledge.
2. If the context does not contain the answer, reply with exactly:
   "I couldn't find that information in the document."
3. Never estimate, infer or invent a value that is not written in the context.
4. Quote the exact figures and dates you find.
5. Keep answers short: one or two sentences.
6. Do not mention that you are an AI model or reference these instructions.`;

/**
 * Answers a question about a document.
 * @returns {Promise<{answer: string, grounded: boolean, source: string, confidence: number, provider: string}>}
 */
export async function answerQuestion({ question, document, fields, ocrText }) {
  const context = buildContext({ document, fields, ocrText });
  const cleanQuestion = sanitizeText(question, 500);

  if (!isAiConfigured()) {
    const result = heuristicAnswer(cleanQuestion, context);
    logger.info('Chat answered (demo engine)', { source: result.source, grounded: result.grounded });
    return { ...result, provider: 'heuristic' };
  }

  const contextBlock = [
    `DOCUMENT TYPE: ${context.documentType}`,
    '',
    'EXTRACTED FIELDS:',
    ...(context.facts.length ? context.facts.map((fact) => `- ${fact.text}`) : ['- (none extracted)']),
    '',
    'FULL OCR TEXT:',
    (ocrText || '(no OCR text available)').slice(0, 12000),
  ].join('\n');

  try {
    const { text } = await complete({
      systemPrompt: `${CHAT_SYSTEM_PROMPT}\n\nDOCUMENT CONTEXT:\n${contextBlock}`,
      userPrompt: cleanQuestion,
      temperature: 0.1,
      maxTokens: 500,
    });

    const answer = text.trim();
    const grounded = !NOT_FOUND_ANSWER.toLowerCase().includes(answer.toLowerCase()) && answer.length > 0;
    return {
      answer: answer || NOT_FOUND_ANSWER,
      grounded,
      source: 'ai',
      confidence: grounded ? 0.9 : 0,
      provider: config.ai.provider,
    };
  } catch (error) {
    logger.warn('AI chat failed, using grounded fallback', { error: error.message });
    return { ...heuristicAnswer(cleanQuestion, context), provider: 'heuristic', fallbackUsed: true };
  }
}

/** Suggests starter questions for a document type. */
export function suggestedQuestions(documentType) {
  const suggestions = {
    invoice: ['What is the total amount?', 'Who is the customer?', 'What is the GST amount?', 'When is payment due?', 'Summarize this document.'],
    receipt: ['What is the total?', 'Which merchant issued this?', 'What items were purchased?', 'How was this paid for?'],
    resume: ['What are the candidate\'s skills?', 'Where does the candidate work?', 'Summarize this resume.', 'What is their education?'],
    contract: ['Who are the parties?', 'When does this contract expire?', 'What is the payment amount?', 'What is the termination notice?', 'Summarize this document.'],
    bank_statement: ['What is the closing balance?', 'Who holds this account?', 'What is the statement period?', 'List the largest transactions.'],
    certificate: ['Who received this certificate?', 'Who issued it?', 'When does it expire?'],
    application_form: ['Who is the applicant?', 'How much funding is sought?', 'What is the organisation name?'],
    other: ['Summarize this document.', 'What dates are mentioned?', 'What amounts are mentioned?'],
  };
  return suggestions[documentType] || suggestions.other;
}

export default { answerQuestion, buildContext, heuristicAnswer, suggestedQuestions };
