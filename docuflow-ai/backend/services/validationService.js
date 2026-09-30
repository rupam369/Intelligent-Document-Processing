/**
 * Validation engine.
 *
 * Produces a list of rule results for a document. Each rule returns one of:
 *   pass     - the check succeeded
 *   fail     - the check found a concrete contradiction
 *   warning  - the check could not be completed or found something suspicious
 *   skipped  - not applicable to this document type
 *
 * Wording is deliberately neutral. The engine never accuses a document of
 * fraud - it reports "Possible discrepancy detected" and lets a human decide.
 */
import { logger } from '../utils/logger.js';
import { getSchemaFor } from './extractionService.js';
import { parseDate, parseNumber, normalizeConfidence } from '../utils/validators.js';

const TOLERANCE = 0.01;

const round = (value) => Number(value.toFixed(2));

function result({ rule, label, status, expected, actual, message, severity }) {
  return {
    rule_name: rule,
    label,
    status,
    expected_value: expected === undefined || expected === null ? null : String(expected),
    actual_value: actual === undefined || actual === null ? null : String(actual),
    message,
    severity: severity || status,
  };
}

const num = (field) => (field && typeof field.value === 'number' ? field.value : parseNumber(field?.value));
const str = (field) => (field && field.value !== null && field.value !== undefined ? String(field.value).trim() : '');

/* ------------------------------------------------------------------ *
 * Shared rules
 * ------------------------------------------------------------------ */

function requiredFieldsRule(fields, documentType) {
  const schema = getSchemaFor(documentType);
  const missing = Object.entries(schema)
    .filter(([name, spec]) => spec.required && !fields[name]?.value && fields[name]?.value !== 0)
    .map(([name, spec]) => spec.label || name);

  if (!missing.length) {
    return result({
      rule: 'required_fields',
      label: 'Required fields present',
      status: 'pass',
      expected: 'All required fields found',
      actual: 'All required fields found',
      message: 'All required fields were located in the document.',
    });
  }
  return result({
    rule: 'required_fields',
    label: 'Required fields present',
    status: 'fail',
    expected: 'All required fields found',
    actual: `Missing: ${missing.join(', ')}`,
    message: `Required information is missing: ${missing.join(', ')}.`,
  });
}

function dateValidityRule(fields) {
  const dateFields = Object.entries(fields).filter(([name]) => /date|until|due|period/i.test(name));
  const problems = [];

  for (const [name, field] of dateFields) {
    if (field.value === null || field.value === undefined || field.value === '') continue;
    if (/period/i.test(name)) continue; // free-text ranges handled separately
    const parsed = parseDate(field.value);
    if (!parsed) {
      problems.push(`${name} ("${field.value}") is not a recognisable date`);
      continue;
    }
    const year = Number(parsed.slice(0, 4));
    if (year < 1990 || year > 2100) problems.push(`${name} (${parsed}) is outside a plausible range`);
  }

  if (!problems.length) {
    return result({
      rule: 'date_validity',
      label: 'Dates are valid',
      status: 'pass',
      message: 'All extracted dates were parsed successfully.',
    });
  }
  return result({
    rule: 'date_validity',
    label: 'Dates are valid',
    status: 'fail',
    actual: problems.join('; '),
    message: `One or more dates could not be validated: ${problems.join('; ')}.`,
  });
}

function numericValuesRule(fields) {
  const numericFields = Object.entries(fields).filter(
    ([, field]) => field.unit === 'currency' || typeof field.value === 'number',
  );
  const problems = numericFields
    .filter(([, field]) => num(field) === null)
    .map(([name]) => name);

  if (!problems.length) {
    return result({
      rule: 'numeric_values',
      label: 'Numeric values parse correctly',
      status: 'pass',
      message: 'All monetary values parsed as numbers.',
    });
  }
  return result({
    rule: 'numeric_values',
    label: 'Numeric values parse correctly',
    status: 'fail',
    actual: problems.join(', '),
    message: `These monetary fields could not be read as numbers: ${problems.join(', ')}.`,
  });
}

function lowConfidenceRule(fields) {
  const low = Object.entries(fields).filter(([, field]) => normalizeConfidence(field.confidence) < 0.7);
  if (!low.length) {
    return result({
      rule: 'field_confidence',
      label: 'Field confidence acceptable',
      status: 'pass',
      message: 'Every extracted field was read with medium confidence or better.',
    });
  }
  return result({
    rule: 'field_confidence',
    label: 'Field confidence acceptable',
    status: 'warning',
    actual: low.map(([name, field]) => `${name} (${Math.round(field.confidence * 100)}%)`).join(', '),
    message: `Some fields have low confidence and may need a quick human check: ${low
      .map(([name, field]) => `${name} (${Math.round(field.confidence * 100)}%)`)
      .join(', ')}.`,
  });
}

function logicalConsistencyRule(fields, documentType) {
  const issues = [];

  if (/invoice|receipt/i.test(documentType)) {
    const total = num(fields.total);
    const subtotal = num(fields.subtotal);
    const tax = num(fields.tax ?? fields.gst);
    if (total !== null && subtotal !== null && tax !== null) {
      const expected = round(subtotal + tax);
      if (Math.abs(expected - total) > TOLERANCE) {
        issues.push(
          `Subtotal + tax (${expected}) does not match the stated total (${round(total)}), a difference of ${round(Math.abs(expected - total))}.`,
        );
      }
      if (total < subtotal) {
        issues.push('The stated total is lower than the subtotal, which is unusual.');
      }
    }
  }

  if (/contract/i.test(documentType)) {
    const start = parseDate(str(fields.start_date));
    const end = parseDate(str(fields.end_date));
    if (start && end && new Date(end) <= new Date(start)) {
      issues.push('The contract end date is not after the start date.');
    }
  }

  if (/invoice|contract|receipt|application/i.test(documentType)) {
    const invoiceDate = parseDate(str(fields.invoice_date));
    const dueDate = parseDate(str(fields.due_date));
    if (invoiceDate && dueDate && new Date(dueDate) < new Date(invoiceDate)) {
      issues.push('The due date falls before the invoice date.');
    }
  }

  if (!issues.length) {
    return result({
      rule: 'logical_consistency',
      label: 'No logical inconsistencies',
      status: 'pass',
      message: 'No logical inconsistencies were detected.',
    });
  }
  return result({
    rule: 'logical_consistency',
    label: 'No logical inconsistencies',
    status: 'fail',
    actual: issues.join(' '),
    message: `Possible discrepancy detected. ${issues.join(' ')}`,
  });
}

function totalCalculationRule(fields) {
  const subtotal = num(fields.subtotal);
  const tax = num(fields.tax ?? fields.gst);
  const total = num(fields.total);

  if (subtotal === null || total === null) {
    return result({
      rule: 'total_calculation',
      label: 'Total calculation verified',
      status: 'skipped',
      message: 'Subtotal and total were not both available, so the sum could not be verified.',
    });
  }

  const taxValue = tax ?? 0;
  const expected = round(subtotal + taxValue);
  if (Math.abs(expected - total) <= TOLERANCE) {
    return result({
      rule: 'total_calculation',
      label: 'Total calculation verified',
      status: 'pass',
      expected,
      actual: round(total),
      message: `Subtotal + tax = ${expected}, which matches the stated total.`,
    });
  }

  return result({
    rule: 'total_calculation',
    label: 'Total calculation verified',
    status: 'fail',
    expected,
    actual: round(total),
    message: `Possible discrepancy detected. Subtotal + tax = ${expected} but the document states ${round(total)} (difference of ${round(Math.abs(expected - total))}).`,
    difference: round(Math.abs(expected - total)),
  });
}

function gstConsistencyRule(fields) {
  const tax = num(fields.tax);
  const gst = num(fields.gst);
  if (tax === null || gst === null) {
    return result({
      rule: 'gst_consistency',
      label: 'GST and total tax agree',
      status: 'skipped',
      message: 'Tax and GST were not both present, so they could not be compared.',
    });
  }
  if (Math.abs(tax - gst) <= TOLERANCE) {
    return result({
      rule: 'gst_consistency',
      label: 'GST and total tax agree',
      status: 'pass',
      expected: tax,
      actual: gst,
      message: 'The GST amount matches the total tax amount.',
    });
  }
  return result({
    rule: 'gst_consistency',
    label: 'GST and total tax agree',
    status: 'warning',
    expected: tax,
    actual: gst,
    message: 'Possible discrepancy detected. The GST line and the total tax line do not match.',
  });
}

function duplicateInvoiceRule(fields, context = {}) {
  const invoiceNumber = str(fields.invoice_number);
  if (!invoiceNumber) {
    return result({
      rule: 'duplicate_invoice_number',
      label: 'Invoice number is unique',
      status: 'skipped',
      message: 'No invoice number was extracted, so uniqueness could not be checked.',
    });
  }
  const existing = context.existingDocumentsWithNumber || [];
  const duplicates = existing.filter((doc) => doc.id !== context.documentId);
  if (!duplicates.length) {
    return result({
      rule: 'duplicate_invoice_number',
      label: 'Invoice number is unique',
      status: 'pass',
      actual: invoiceNumber,
      message: `No other document in your account uses invoice number ${invoiceNumber}.`,
    });
  }
  return result({
    rule: 'duplicate_invoice_number',
    label: 'Invoice number is unique',
    status: 'warning',
    expected: 'Unique invoice number',
    actual: `${duplicates.length} other document(s) with ${invoiceNumber}`,
    message: `Possible discrepancy detected. ${duplicates.length} other document(s) in your account use invoice number ${invoiceNumber}.`,
  });
}

function bankStatementBalanceRule(fields) {
  const opening = num(fields.opening_balance);
  const closing = num(fields.closing_balance);
  const transactions = Array.isArray(fields.transactions?.value) ? fields.transactions.value : [];

  if (opening === null || closing === null || !transactions.length) {
    return result({
      rule: 'statement_balance',
      label: 'Statement balances reconcile',
      status: 'skipped',
      message: 'Opening balance, closing balance and transactions were not all available.',
    });
  }

  const credits = transactions.reduce((sum, tx) => sum + (parseNumber(tx.credit) || 0), 0);
  const debits = transactions.reduce((sum, tx) => sum + (parseNumber(tx.debit) || 0), 0);
  const expected = round(opening + credits - debits);

  if (Math.abs(expected - closing) <= TOLERANCE) {
    return result({
      rule: 'statement_balance',
      label: 'Statement balances reconcile',
      status: 'pass',
      expected,
      actual: round(closing),
      message: 'Opening balance plus credits minus debits matches the closing balance.',
    });
  }
  return result({
    rule: 'statement_balance',
    label: 'Statement balances reconcile',
    status: 'fail',
    expected,
    actual: round(closing),
    message: `Possible discrepancy detected. The statement reconciles to ${expected} but reports a closing balance of ${round(closing)} (difference of ${round(Math.abs(expected - closing))}).`,
    difference: round(Math.abs(expected - closing)),
  });
}

function resumeContactRule(fields) {
  const issues = [];
  const email = str(fields.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) issues.push(`email "${email}" is not a valid address`);
  const phone = str(fields.phone);
  if (phone && (phone.match(/\d/g) || []).length < 7) issues.push('phone number looks too short');

  if (!issues.length) {
    return result({
      rule: 'contact_details',
      label: 'Contact details look valid',
      status: 'pass',
      message: 'Email and phone number were located and look well formed.',
    });
  }
  return result({
    rule: 'contact_details',
    label: 'Contact details look valid',
    status: 'warning',
    actual: issues.join('; '),
    message: `Contact details need a quick check: ${issues.join('; ')}.`,
  });
}

function contractDateRangeRule(fields) {
  const start = parseDate(str(fields.start_date));
  const end = parseDate(str(fields.end_date));
  if (!start || !end) {
    return result({
      rule: 'contract_term',
      label: 'Contract term is coherent',
      status: 'skipped',
      message: 'Both the start and end date are needed to check the term.',
    });
  }
  const days = Math.round((new Date(end) - new Date(start)) / 86400000);
  if (days > 0) {
    return result({
      rule: 'contract_term',
      label: 'Contract term is coherent',
      status: 'pass',
      expected: 'End date after start date',
      actual: `${days} days`,
      message: `The contract runs for ${days} days.`,
    });
  }
  return result({
    rule: 'contract_term',
    label: 'Contract term is coherent',
    status: 'fail',
    expected: 'End date after start date',
    actual: `${days} days`,
    message: 'Possible discrepancy detected. The contract end date is not after its start date.',
  });
}

/* ------------------------------------------------------------------ *
 * Rule registry
 *
 * `types: null` means the rule applies to every document type.
 * ------------------------------------------------------------------ */

const RULES = [
  { name: 'required_fields', types: null, fn: requiredFieldsRule },
  { name: 'date_validity', types: null, fn: dateValidityRule },
  { name: 'numeric_values', types: null, fn: numericValuesRule },
  { name: 'total_calculation', types: ['invoice', 'receipt'], fn: totalCalculationRule },
  { name: 'gst_consistency', types: ['invoice'], fn: gstConsistencyRule },
  { name: 'logical_consistency', types: null, fn: logicalConsistencyRule },
  { name: 'statement_balance', types: ['bank_statement'], fn: bankStatementBalanceRule },
  { name: 'contract_term', types: ['contract'], fn: contractDateRangeRule },
  { name: 'contact_details', types: ['resume', 'application_form'], fn: resumeContactRule },
  { name: 'duplicate_invoice_number', types: ['invoice'], fn: duplicateInvoiceRule },
  { name: 'field_confidence', types: null, fn: lowConfidenceRule },
];

/**
 * Runs every applicable rule for a document type.
 * @param {{fields: object, documentType: string, context?: object}} input
 * @returns {{results: Array, summary: {passed: number, failed: number, warnings: number, skipped: number}}}
 */
export function validate({ fields = {}, documentType = 'other', context = {} }) {
  const results = [];
  for (const rule of RULES) {
    if (rule.types && !rule.types.includes(documentType)) continue;
    try {
      const outcome = rule.fn(fields, documentType, context);
      if (outcome) results.push(outcome);
    } catch (error) {
      logger.warn('Validation rule threw', { rule: rule.name, error: error.message });
      results.push(
        result({
          rule: rule.name,
          label: 'Rule error',
          status: 'warning',
          message: 'This check could not be completed and needs a manual look.',
        }),
      );
    }
  }

  const summary = {
    passed: results.filter((item) => item.status === 'pass').length,
    failed: results.filter((item) => item.status === 'fail').length,
    warnings: results.filter((item) => item.status === 'warning').length,
    skipped: results.filter((item) => item.status === 'skipped').length,
  };

  return { results, summary };
}

/**
 * Decides the post-pipeline document status.
 * @returns {{status: 'verified'|'needs_review'|'error', reason: string}}
 */
export function decideStatus({ validation, fields = {}, classificationConfidence = 0 }) {
  const summary = validation?.summary || {};
  const missing = validation?.results?.find((item) => item.rule_name === 'required_fields');
  const confidence = normalizeConfidence(classificationConfidence);

  if (summary.failed > 0) {
    const failing = validation.results.filter((item) => item.status === 'fail').map((item) => item.label);
    return { status: 'needs_review', reason: `Validation reported: ${failing.join('; ')}.` };
  }
  if (missing && missing.status === 'fail') {
    return { status: 'needs_review', reason: 'Required fields are missing.' };
  }
  if (summary.warnings > 0) {
    return { status: 'needs_review', reason: 'Some checks need a human confirmation.' };
  }
  if (confidence < 0.7) {
    return { status: 'needs_review', reason: `Classification confidence is low (${Math.round(confidence * 100)}%).` };
  }
  return { status: 'verified', reason: 'All checks passed with high confidence.' };
}

export default { validate, decideStatus };
