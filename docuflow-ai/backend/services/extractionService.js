/**
 * Structured data extraction.
 *
 * Every document type has an explicit schema so the AI (or the offline
 * heuristic engine) is forced to return predictable JSON:
 *
 *   { "invoice_number": { "value": "INV-1023", "confidence": 0.99 }, ... }
 *
 * Controllers never parse free-form text - they receive typed fields with
 * per-field confidence scores.
 */
import { config, isAiConfigured } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { completeJson } from './aiClient.js';
import { parseLooseJson } from '../utils/json.js';
import { normalizeConfidence, parseNumber, parseDate, sanitizeText } from '../utils/validators.js';

/** Field definitions per document type. */
export const EXTRACTION_SCHEMAS = {
  invoice: {
    invoice_number: { label: 'Invoice Number', type: 'string', required: true },
    customer_name: { label: 'Customer', type: 'string', required: true },
    vendor_name: { label: 'Vendor', type: 'string', required: true },
    invoice_date: { label: 'Invoice Date', type: 'date', required: true },
    due_date: { label: 'Due Date', type: 'date', required: false },
    subtotal: { label: 'Subtotal', type: 'currency', required: true },
    tax: { label: 'Tax', type: 'currency', required: false },
    gst: { label: 'GST', type: 'currency', required: false },
    total: { label: 'Total', type: 'currency', required: true },
    currency: { label: 'Currency', type: 'string', required: false },
    address: { label: 'Billing Address', type: 'string', required: false },
  },
  receipt: {
    merchant_name: { label: 'Merchant', type: 'string', required: true },
    receipt_number: { label: 'Receipt Number', type: 'string', required: false },
    date: { label: 'Date', type: 'date', required: true },
    items: { label: 'Items', type: 'array', required: false },
    subtotal: { label: 'Subtotal', type: 'currency', required: false },
    tax: { label: 'Tax', type: 'currency', required: false },
    total: { label: 'Total', type: 'currency', required: true },
    payment_method: { label: 'Payment Method', type: 'string', required: false },
  },
  resume: {
    name: { label: 'Full Name', type: 'string', required: true },
    email: { label: 'Email', type: 'string', required: true },
    phone: { label: 'Phone', type: 'string', required: false },
    location: { label: 'Location', type: 'string', required: false },
    skills: { label: 'Skills', type: 'array', required: false },
    education: { label: 'Education', type: 'array', required: false },
    experience: { label: 'Experience', type: 'array', required: false },
    projects: { label: 'Projects', type: 'array', required: false },
  },
  contract: {
    parties: { label: 'Parties', type: 'array', required: true },
    start_date: { label: 'Start Date', type: 'date', required: true },
    end_date: { label: 'End Date', type: 'date', required: false },
    payment_amount: { label: 'Payment Amount', type: 'currency', required: false },
    payment_frequency: { label: 'Payment Frequency', type: 'string', required: false },
    termination_notice: { label: 'Termination Notice', type: 'string', required: false },
    important_clauses: { label: 'Important Clauses', type: 'array', required: false },
  },
  bank_statement: {
    account_holder: { label: 'Account Holder', type: 'string', required: true },
    account_number_masked: { label: 'Account Number (masked)', type: 'string', required: true },
    statement_period: { label: 'Statement Period', type: 'string', required: true },
    transactions: { label: 'Transactions', type: 'array', required: false },
    opening_balance: { label: 'Opening Balance', type: 'currency', required: true },
    closing_balance: { label: 'Closing Balance', type: 'currency', required: true },
  },
  certificate: {
    recipient_name: { label: 'Recipient', type: 'string', required: true },
    certificate_title: { label: 'Certificate Title', type: 'string', required: true },
    issuer: { label: 'Issuer', type: 'string', required: false },
    issue_date: { label: 'Issue Date', type: 'date', required: false },
    certificate_id: { label: 'Certificate ID', type: 'string', required: false },
    valid_until: { label: 'Valid Until', type: 'date', required: false },
  },
  application_form: {
    applicant_name: { label: 'Applicant Name', type: 'string', required: true },
    email: { label: 'Email', type: 'string', required: false },
    phone: { label: 'Phone', type: 'string', required: false },
    date_of_birth: { label: 'Date of Birth', type: 'date', required: false },
    address: { label: 'Address', type: 'string', required: false },
    organisation_name: { label: 'Organisation', type: 'string', required: false },
    amount_requested: { label: 'Amount Requested', type: 'currency', required: false },
    submitted_on: { label: 'Submitted On', type: 'date', required: false },
  },
  other: {
    title: { label: 'Document Title', type: 'string', required: false },
    dates: { label: 'Dates Mentioned', type: 'array', required: false },
    amounts: { label: 'Amounts Mentioned', type: 'array', required: false },
    organisations: { label: 'Organisations', type: 'array', required: false },
    emails: { label: 'Emails', type: 'array', required: false },
    phone_numbers: { label: 'Phone Numbers', type: 'array', required: false },
  },
};

export const getSchemaFor = (documentType) => EXTRACTION_SCHEMAS[documentType] || EXTRACTION_SCHEMAS.other;

/* ------------------------------------------------------------------ *
 * Offline heuristic extraction (DEMO MODE engine)
 * ------------------------------------------------------------------ */

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]{2,}/;
const PHONE_RE = /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3}[\s-]?\d{3,5}(?:[\s-]?\d{2,5})?/;
const DATE_RE = /\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/;
const MONEY_RE = /(?:₹|rs\.?|inr|usd|\$|€|£)?\s?([\d]{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+\.\d{2})/i;

const CONFIDENCE = { labelled: 0.96, inferred: 0.82, weak: 0.62 };

function field(value, confidence, { unit, note } = {}) {
  if (value === undefined || value === null || value === '') return null;
  return { value, confidence: normalizeConfidence(confidence), ...(unit ? { unit } : {}), ...(note ? { note } : {}) };
}

/** Removes a leading "Label:" prefix from a captured value. */
function stripLabel(value) {
  return String(value)
    .replace(/^[a-z][a-z\s/&-]{2,30}\s*[:\-]\s*/i, '')
    .trim();
}

/** Grabs the value following a "Label:" pattern. */
function afterLabel(text, labelPatterns) {
  for (const pattern of labelPatterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[1].trim()) return { value: match[1].trim(), labelled: true };
  }
  return null;
}

/** Returns a section of text between two headings. */
function section(text, startPatterns, endPatterns = []) {
  const lines = text.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (startPatterns.some((pattern) => pattern.test(lines[i]))) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return '';
  const collected = [];
  for (let i = start; i < lines.length; i += 1) {
    if (endPatterns.some((pattern) => pattern.test(lines[i]))) break;
    collected.push(lines[i]);
  }
  return collected.join('\n').trim();
}

function toList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return String(value)
    .split(/[,;]|\n/)
    .map((item) => item.trim())
    .filter((item) => item.length > 1);
}

function extractInvoice(text) {
  const fields = {};
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

  fields.invoice_number = field(
    afterLabel(text, [/invoice\s*(?:no|number|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{2,})/i])?.value,
    CONFIDENCE.labelled,
  );

  const TITLE_WORDS = /^(tax\s+)?(invoice|receipt|bill|statement|certificate|resume|curriculum vitae|application form|contract|agreement|purchase order)\s*$/i;
  const vendorLine = lines.find((line) => line.length > 3 && !TITLE_WORDS.test(line.trim())) || lines[0];
  fields.vendor_name = field(vendorLine, CONFIDENCE.inferred, { note: 'Taken from the document header' });

  const BILLED_RE = /^(billed\s+to|bill\s+to|customer|sold\s+to)\s*[:\-]\s*(.+)$/i;
  const BILLED_HEADING_RE = /^(billed\s+to|bill\s+to|customer|sold\s+to)\s*:?$/i;
  const ADDRESS_STOP_RE = /^(description|invoice|due|subtotal|gst|cgst|sgst|total|currency|payment|amounts?|items?|qty|date)/i;

  let customerName = null;
  let addressLines = [];
  let cursor = -1;

  const inlineMatch = lines.find((line) => BILLED_RE.test(line));
  if (inlineMatch) {
    customerName = inlineMatch.match(BILLED_RE)[2].trim();
    cursor = lines.indexOf(inlineMatch) + 1;
  } else {
    const billedIndex = lines.findIndex((line) => BILLED_HEADING_RE.test(line));
    if (billedIndex !== -1) {
      customerName = lines[billedIndex + 1];
      cursor = billedIndex + 2;
    }
  }

  if (cursor !== -1) {
    for (let i = cursor; i < lines.length && i < cursor + 4; i += 1) {
      if (!lines[i].trim() || ADDRESS_STOP_RE.test(lines[i])) break;
      addressLines.push(lines[i]);
    }
  }

  if (customerName) fields.customer_name = field(stripLabel(customerName), CONFIDENCE.labelled);
  if (addressLines.length) {
    fields.address = field(stripLabel(addressLines.join(', ')), CONFIDENCE.inferred);
  }

  fields.invoice_date = field(
    afterLabel(text, [/invoice\s*date\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i])?.value,
    CONFIDENCE.labelled,
  );
  fields.due_date = field(
    afterLabel(text, [/due\s*date\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i])?.value,
    CONFIDENCE.labelled,
  );

  fields.subtotal = field(parseNumber(afterLabel(text, [/sub\s*total\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i])?.value), CONFIDENCE.labelled, { unit: 'currency' });

  // Prefer an explicit total-tax line, otherwise sum the components.
  const totalTax = afterLabel(text, [/total\s*(?:gst|tax|vat)\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i]);
  const cgst = parseNumber(afterLabel(text, [/cgst[^\n:]*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i])?.value);
  const sgst = parseNumber(afterLabel(text, [/sgst[^\n:]*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i])?.value);
  const gstLine = afterLabel(text, [/(?:^|\n)\s*gst\s*(?:@\s*\d+%)?\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i]);
  const taxValue = totalTax?.value
    ? parseNumber(totalTax.value)
    : cgst !== null && sgst !== null
      ? cgst + sgst
      : parseNumber(gstLine?.value);
  fields.tax = field(taxValue, taxValue !== null ? CONFIDENCE.labelled : undefined, { unit: 'currency' });
  fields.gst = field(taxValue, taxValue !== null ? CONFIDENCE.labelled : undefined, { unit: 'currency' });

  // Prefer an explicit total line; the lookbehind stops "Subtotal" matching "total".
  const totalMatch = afterLabel(text, [
    /(?<![a-z])grand\s*total\s*(?:amount)?\s*(?:due|payable)?\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?<![a-z])total\s*amount\s*(?:due|payable)?\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?<![a-z])total\s*(?:due|payable)\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?<![a-z])total\s*(?:amount)?\s*(?:due|payable)?\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  ]);
  fields.total = field(parseNumber(totalMatch?.value), totalMatch ? CONFIDENCE.labelled : undefined, { unit: 'currency' });

  const currency = afterLabel(text, [/currency\s*[:\-]?\s*([A-Z]{3})/i]);
  fields.currency = field(currency?.value || (text.includes('₹') ? 'INR' : null), currency ? CONFIDENCE.labelled : CONFIDENCE.weak);

  return fields;
}

function extractReceipt(text) {
  const fields = {};
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  fields.merchant_name = field(lines[0], CONFIDENCE.inferred);
  fields.receipt_number = field(
    afterLabel(text, [/receipt\s*(?:no|number|#)\s*[:\-]?\s*([A-Z0-9\-\/]{3,})/i])?.value,
    CONFIDENCE.labelled,
  );
  fields.date = field(afterLabel(text, [/(?:^|\n)\s*date\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i])?.value, CONFIDENCE.labelled);
  fields.subtotal = field(parseNumber(afterLabel(text, [/sub\s*total\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i])?.value), CONFIDENCE.labelled, { unit: 'currency' });
  fields.tax = field(parseNumber(afterLabel(text, [/(?:gst|vat|tax)\s*(?:@\s*\d+%)?\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i])?.value), CONFIDENCE.labelled, { unit: 'currency' });
  fields.total = field(
    parseNumber(
      afterLabel(text, [
        /(?<![a-z])total\s*(?:amount)?\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i,
      ])?.value,
    ),
    CONFIDENCE.labelled,
    { unit: 'currency' },
  );
  const payment = afterLabel(text, [/paid\s*(?:by|via|with)\s*[:\-]?\s*([^\n]+)/i]);
  fields.payment_method = field(payment?.value, CONFIDENCE.labelled);

  const itemLines = lines.filter((line) => /^\s*[\w\s.'-]+\s+\d+(\.\d+)?\s*(kg|g|l|ml|x)?\s+[\d,]+\.\d{2}\s*$/.test(line));
  if (itemLines.length) {
    fields.items = {
      value: itemLines.map((line) => sanitizeText(line, 120)),
      confidence: CONFIDENCE.inferred,
    };
  }
  return fields;
}

function extractResume(text) {
  const fields = {};
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  fields.name = field(lines[0], CONFIDENCE.inferred, { note: 'First line of the document' });
  fields.email = field(text.match(EMAIL_RE)?.[0], CONFIDENCE.labelled);
  const phoneMatch = text.match(PHONE_RE);
  fields.phone = field(phoneMatch?.[0], phoneMatch ? CONFIDENCE.labelled : undefined);

  const locationLine = lines.find(
    (line, index) =>
      index > 0 &&
      index < 8 &&
      !line.includes('@') &&
      !/https?:/.test(line) &&
      !/\d/.test(line) &&
      (line.match(/,/g) || []).length >= 2 &&
      line.length < 60,
  );
  fields.location = field(locationLine, locationLine ? CONFIDENCE.inferred : undefined);

  const skillsText = section(text, [/^technical\s+skills/i, /^skills/i], [/^\s*$/]);
  if (skillsText) {
    fields.skills = { value: toList(skillsText.replace(/\n/g, ', ')), confidence: CONFIDENCE.labelled };
  }
  const educationText = section(text, [/^education/i], [/^\s*$/]);
  if (educationText) {
    fields.education = { value: toList(educationText.replace(/\n/g, ', ')), confidence: CONFIDENCE.labelled };
  }
  const experienceText = section(text, [/^(professional\s+)?(work\s+)?experience/i], [/^education/i]);
  if (experienceText) {
    fields.experience = {
      value: experienceText.split(/\n(?=[A-Z])/).map((entry) => sanitizeText(entry, 300)).filter(Boolean),
      confidence: CONFIDENCE.inferred,
    };
  }
  const projectsText = section(text, [/^projects/i], [/^\s*$/]);
  if (projectsText) {
    fields.projects = {
      value: projectsText.split(/\n(?=[A-Z])/).map((entry) => sanitizeText(entry, 300)).filter(Boolean),
      confidence: CONFIDENCE.inferred,
    };
  }
  return fields;
}

function extractContract(text) {
  const fields = {};

  const partiesBlock = section(text, [/by and between/i, /between\s*:/i], [/^\s*1\.\s/i]);
  if (partiesBlock) {
    const parties = [];
    const entries = partiesBlock.split(/\n(?=\(?\d\)?\s)/);
    for (const entry of entries) {
      const roleMatch = entry.match(/\("([^"]+)"\)/);
      const nameMatch = entry.match(/(?:\(\d\)\s*)?([A-Z][A-Za-z&.\s]*(?:PRIVATE\s+)?LIMITED|[A-Z][A-Za-z.\s]+?)(?:,|\s+a\s+company|\s+an\s+independent)/);
      const name = nameMatch?.[1]?.trim();
      if (name && name.length > 2) {
        parties.push({ name, role: roleMatch?.[1] || 'party' });
      }
    }
    if (parties.length) fields.parties = { value: parties, confidence: CONFIDENCE.inferred };
  }

  fields.start_date = field(
    afterLabel(text, [
      /commences?\s+on\s+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
      /entered\s+into\s+on\s+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
      /effective\s+date\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
    ])?.value,
    CONFIDENCE.labelled,
  );
  fields.end_date = field(
    afterLabel(text, [
      /ending\s+on\s+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
      /expires?\s+on\s+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
      /end\s*date\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
    ])?.value,
    CONFIDENCE.labelled,
  );
  fields.payment_amount = field(
    parseNumber(
      afterLabel(text, [
        /(?:retainer|fee|fees|amount|compensation)\s*(?:of|:)?\s*(?:inr|rs\.?|₹|\$|usd)?\s*([\d,]+(?:\.\d{1,2})?)/i,
      ])?.value,
    ),
    CONFIDENCE.labelled,
    { unit: 'currency' },
  );
  fields.payment_frequency = field(
    afterLabel(text, [/payment\s*frequency\s*[:\-]?\s*([a-z]+)/i])?.value ||
      (/monthly/i.test(text) ? 'monthly' : null),
    CONFIDENCE.inferred,
  );
  const NUMBER_WORDS = { one: 1, two: 2, three: 3, seven: 7, ten: 10, fourteen: 14, fifteen: 15, thirty: 30, sixty: 60, ninety: 90 };
  const noticePatterns = [
    /termination\s*notice\s*(?:period)?\s*[:\-]?\s*(\d+)\s*days/i,
    /(\d+)\s*\(\d+\)\s*days?\s*(?:prior\s*)?(?:written\s*)?notice/i,
    /(\d+)\s*days?\s*(?:prior\s*)?(?:written\s*)?notice/i,
  ];
  let noticeDays = null;
  for (const pattern of noticePatterns) {
    const match = text.match(pattern);
    if (match) {
      noticeDays = match[1];
      break;
    }
  }
  if (noticeDays === null) {
    const wordMatch = text.match(/\b(one|two|three|seven|ten|fourteen|fifteen|thirty|sixty|ninety)\s*\(\d+\)\s*days?\s*(?:prior\s*)?(?:written\s*)?notice/i)
      || text.match(/\b(one|two|three|seven|ten|fourteen|fifteen|thirty|sixty|ninety)\s*days?\s*(?:prior\s*)?(?:written\s*)?notice/i);
    if (wordMatch) noticeDays = String(NUMBER_WORDS[wordMatch[1]]);
  }
  fields.termination_notice = field(noticeDays ? `${noticeDays} days` : null, noticeDays ? CONFIDENCE.labelled : undefined);

  const clauseLines = text.split('\n').filter((line) => /^\s*\d+\.\s+[A-Z][A-Z\s&/-]{3,}$/.test(line.trim()));
  if (clauseLines.length) {
    fields.important_clauses = {
      value: clauseLines.map((line) => line.trim().replace(/^\d+\.\s+/, '')),
      confidence: CONFIDENCE.inferred,
    };
  }
  return fields;
}

function extractBankStatement(text) {
  const fields = {};
  fields.account_holder = field(afterLabel(text, [/account\s*holder\s*[:\-]?\s*([^\n]+)/i])?.value, CONFIDENCE.labelled);
  fields.account_number_masked = field(
    afterLabel(text, [/account\s*(?:number|no)\s*[:\-]?\s*([X*x*\d\s-]{6,})/i])?.value,
    CONFIDENCE.labelled,
  );
  fields.statement_period = field(
    afterLabel(text, [/statement\s*period\s*[:\-]?\s*([^\n]+)/i])?.value,
    CONFIDENCE.labelled,
  );

  const transactions = [];
  const lines = text.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const dateMatch = line.match(/^(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\s+(.*)$/);
    if (!dateMatch) continue;
    const rest = dateMatch[2];
    if (/opening balance/i.test(rest)) {
      const opening = parseNumber(rest.match(/([\d,]+\.\d{2})\s*$/)?.[1]);
      if (opening !== null) fields.opening_balance = { value: opening, confidence: CONFIDENCE.labelled, unit: 'currency' };
      continue;
    }
    if (/closing balance/i.test(rest)) {
      const closing = parseNumber(rest.match(/([\d,]+\.\d{2})\s*$/)?.[1]);
      if (closing !== null) fields.closing_balance = { value: closing, confidence: CONFIDENCE.labelled, unit: 'currency' };
      continue;
    }
    const numbers = [...rest.matchAll(/([\d,]+\.\d{2})/g)].map((match) => parseNumber(match[1]));
    const description = rest.replace(/([\d,]+\.\d{2})/g, '').replace(/\s{2,}/g, ' ').trim();
    if (numbers.length >= 2 && description) {
      const isCredit = /salary|credit|freelance|redemption|deposit|refund|interest/i.test(description);
      transactions.push({
        date: parseDate(dateMatch[1]),
        description: sanitizeText(description, 120),
        debit: isCredit ? null : numbers[0],
        credit: isCredit ? numbers[0] : null,
        balance: numbers[numbers.length - 1],
      });
    }
  }
  if (transactions.length) {
    fields.transactions = { value: transactions, confidence: CONFIDENCE.inferred };
    const lastBalance = transactions[transactions.length - 1].balance;
    if (lastBalance && !fields.closing_balance) {
      fields.closing_balance = { value: lastBalance, confidence: CONFIDENCE.inferred, unit: 'currency' };
    }
  }
  return fields;
}

function extractCertificate(text) {
  const fields = {};
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const titleIndex = lines.findIndex((line) => /certificate of/i.test(line));
  if (titleIndex !== -1) fields.certificate_title = field(lines[titleIndex], CONFIDENCE.labelled);

  const certifyIndex = lines.findIndex((line) => /this is to certify that/i.test(line));
  if (certifyIndex !== -1) fields.recipient_name = field(lines[certifyIndex + 1], CONFIDENCE.labelled);

  const titleLine = lines.find((line) => /^[""].+[""]$/.test(line) || /^".+"$/.test(line));
  if (titleLine && !fields.certificate_title) {
    fields.certificate_title = field(titleLine.replace(/^[""]|[""]$/g, ''), CONFIDENCE.inferred);
  }
  fields.issuer = field(afterLabel(text, [/issued\s*by\s*[:\-]?\s*([^\n]+)/i])?.value, CONFIDENCE.labelled);
  fields.issue_date = field(afterLabel(text, [/(?:issue|issued)\s*date\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i])?.value, CONFIDENCE.labelled);
  fields.certificate_id = field(afterLabel(text, [/certificate\s*(?:id|no|number)\s*[:\-]?\s*([A-Z0-9\-\/]{3,})/i])?.value, CONFIDENCE.labelled);
  fields.valid_until = field(afterLabel(text, [/valid\s*(?:until|till|through)\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i])?.value, CONFIDENCE.labelled);
  return fields;
}

function extractApplicationForm(text) {
  const fields = {};
  const pick = (patterns) => afterLabel(text, patterns)?.value;
  fields.applicant_name = field(pick([/applicant\s*name\s*[:\-]?\s*([^\n]+)/i, /^name\s*[:\-]?\s*([^\n]+)/im]), CONFIDENCE.labelled);
  fields.email = field(text.match(EMAIL_RE)?.[0], CONFIDENCE.labelled);
  const phoneMatch = text.match(PHONE_RE);
  fields.phone = field(phoneMatch?.[0], CONFIDENCE.labelled);
  fields.date_of_birth = field(pick([/date\s*of\s*birth\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i]), CONFIDENCE.labelled);
  fields.address = field(pick([/address\s*[:\-]?\s*([^\n]+)/i]), CONFIDENCE.labelled);
  fields.organisation_name = field(
    pick([/startup\s*name\s*[:\-]?\s*([^\n]+)/i, /compan(?:y|ies)\s*name\s*[:\-]?\s*([^\n]+)/i, /organisation\s*name\s*[:\-]?\s*([^\n]+)/i]),
    CONFIDENCE.labelled,
  );
  fields.amount_requested = field(
    parseNumber(pick([/funding\s*sought\s*[:\-]?\s*(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i, /amount\s*(?:requested|sought)\s*[:\-]?\s*(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i])),
    CONFIDENCE.labelled,
    { unit: 'currency' },
  );
  fields.submitted_on = field(pick([/submitted\s*(?:on|date)\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i]), CONFIDENCE.labelled);
  return fields;
}

function extractGeneric(text) {
  const fields = {};
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  fields.title = field(lines[0], CONFIDENCE.inferred);
  const dates = [...new Set((text.match(/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/g) || []))].slice(0, 8);
  if (dates.length) fields.dates = { value: dates, confidence: CONFIDENCE.inferred };
  const amounts = [...new Set((text.match(/(?:₹|rs\.?|inr|\$)\s?[\d,]+(?:\.\d{1,2})?/gi) || []))].slice(0, 8);
  if (amounts.length) fields.amounts = { value: amounts, confidence: CONFIDENCE.inferred };
  const emails = [...new Set(text.match(EMAIL_RE) || [])].slice(0, 5);
  if (emails.length) fields.emails = { value: emails, confidence: CONFIDENCE.labelled };
  const phones = [...new Set(text.match(/(?:\+\d{1,3}[\s-]?)?\d{5}[\s-]?\d{5}/g) || [])].slice(0, 5);
  if (phones.length) fields.phone_numbers = { value: phones, confidence: CONFIDENCE.inferred };
  return fields;
}

const HEURISTIC_EXTRACTORS = {
  invoice: extractInvoice,
  receipt: extractReceipt,
  resume: extractResume,
  contract: extractContract,
  bank_statement: extractBankStatement,
  certificate: extractCertificate,
  application_form: extractApplicationForm,
  other: extractGeneric,
};

/** Offline extraction engine used in DEMO MODE. */
export function heuristicExtract(ocrText = '', documentType = 'other') {
  const extractor = HEURISTIC_EXTRACTORS[documentType] || extractGeneric;
  const raw = extractor(ocrText);
  const schema = getSchemaFor(documentType);
  const fields = {};
  const missing = [];

  for (const [name, spec] of Object.entries(schema)) {
    const extracted = raw[name];
    if (extracted && extracted.value !== undefined && extracted.value !== null && extracted.value !== '') {
      let value = extracted.value;
      if (spec.type === 'date') {
        const parsed = parseDate(value);
        if (parsed) value = parsed;
      }
      fields[name] = {
        value,
        confidence: normalizeConfidence(extracted.confidence, CONFIDENCE.weak),
        ...(spec.type === 'currency' ? { unit: 'currency' } : {}),
        ...(extracted.note ? { note: extracted.note } : {}),
      };
    } else if (spec.required) {
      missing.push(name);
    }
  }

  // Preserve anything the extractor found that is not in the schema.
  for (const [name, extracted] of Object.entries(raw)) {
    if (schema[name] || fields[name]) continue;
    fields[name] = {
      value: extracted.value,
      confidence: normalizeConfidence(extracted.confidence, CONFIDENCE.weak),
    };
  }

  return { fields, missing, engine: 'heuristic', schema: Object.keys(schema) };
}

/* ------------------------------------------------------------------ *
 * AI-powered extraction
 * ------------------------------------------------------------------ */

function buildExtractionPrompt(documentType, ocrText) {
  const schema = getSchemaFor(documentType);
  const lines = Object.entries(schema).map(([name, spec]) => {
    const flag = spec.required ? 'required' : 'optional';
    return `  "${name}": {"value": <${spec.type} or null>, "confidence": <0-1>}   // ${spec.label} (${flag})`;
  });

  return `Document type: ${documentType}

Extract the following fields from the document text below.
Respond with JSON ONLY, using this exact shape:

{
${lines.join(',\n')}
}

Rules:
- Every field must be an object with "value" and "confidence" (0-1).
- Use null for "value" when the document does not contain the information.
- Do not guess. A low confidence is better than an invented value.
- Dates must be ISO format YYYY-MM-DD.
- Currency values must be plain numbers (no symbols, no thousands separators).
- Arrays should contain plain strings or simple objects.

DOCUMENT TEXT:
"""
${ocrText.slice(0, 12000)}
"""`;
}

function normaliseAiFields(parsed, documentType) {
  const schema = getSchemaFor(documentType);
  const fields = {};
  const missing = [];

  for (const [name, spec] of Object.entries(schema)) {
    const entry = parsed?.[name];
    if (entry === undefined || entry === null) {
      if (spec.required) missing.push(name);
      continue;
    }
    // Tolerate a bare value instead of {value, confidence}.
    const wrapped = typeof entry === 'object' && !Array.isArray(entry) && 'value' in entry ? entry : { value: entry };
    let value = wrapped.value ?? null;

    if (value === null || value === undefined || value === '') {
      if (spec.required) missing.push(name);
      continue;
    }
    if (spec.type === 'date') {
      const parsedDate = parseDate(value);
      if (parsedDate) value = parsedDate;
    }
    if (spec.type === 'currency' && typeof value === 'string') {
      const parsedNumber = parseNumber(value);
      if (parsedNumber !== null) value = parsedNumber;
    }
    if (typeof value === 'string') value = sanitizeText(value, 2000);

    fields[name] = {
      value,
      confidence: normalizeConfidence(wrapped.confidence, 0.75),
      ...(spec.type === 'currency' ? { unit: 'currency' } : {}),
    };
  }

  return { fields, missing, engine: config.ai.provider, schema: Object.keys(schema) };
}

/**
 * Extracts structured fields from OCR text.
 * @param {{ocrText: string, documentType: string, fileName?: string}} input
 */
export async function extractData({ ocrText, documentType, fileName }) {
  if (!isAiConfigured()) {
    const result = heuristicExtract(ocrText, documentType);
    logger.info('Extraction (demo engine)', {
      fileName,
      documentType,
      fieldCount: Object.keys(result.fields).length,
      missing: result.missing.length,
    });
    return result;
  }

  try {
    const { parsed } = await completeJson({
      systemPrompt:
        'You are a document data-extraction engine. You return strict JSON only, ' +
        'never prose, never markdown. Accuracy matters more than completeness: ' +
        'if a value is not present in the document, return null with low confidence.',
      userPrompt: buildExtractionPrompt(documentType, ocrText),
      parse: parseLooseJson,
      maxTokens: 3000,
    });
    const result = normaliseAiFields(parsed, documentType);
    logger.info('Extraction (AI)', {
      fileName,
      documentType,
      provider: config.ai.provider,
      fieldCount: Object.keys(result.fields).length,
      missing: result.missing.length,
    });
    return result;
  } catch (error) {
    logger.warn('AI extraction failed, using heuristic fallback', { error: error.message });
    return { ...heuristicExtract(ocrText, documentType), fallbackUsed: true };
  }
}

export default { extractData, heuristicExtract, EXTRACTION_SCHEMAS, getSchemaFor };
