/**
 * Chat controller - document-grounded Q&A plus history.
 */
import { asyncHandler } from '../middleware/errorMiddleware.js';
import { db, assertOwnership } from '../services/database.js';
import { answerQuestion, suggestedQuestions } from '../services/chatService.js';
import { requireString } from '../utils/validators.js';

/** Parses stored extracted_data rows into a fields map. */
async function loadFields(documentId) {
  const rows = await db.getExtractedData(documentId);
  const fields = {};
  for (const row of rows) {
    let value = row.field_value;
    try {
      value = JSON.parse(row.field_value);
    } catch {
      /* keep the raw string */
    }
    fields[row.field_name] = { value, confidence: row.confidence };
  }
  return fields;
}

/** POST /api/documents/:id/chat */
export const askQuestion = asyncHandler(async (request, response) => {
  const document = assertOwnership(
    await db.getDocument(request.user.id, request.params.id),
    request.user.id,
  );
  const question = requireString(request.body?.question, 'Question', { min: 2, max: 500 });

  const fields = await loadFields(document.id);
  const result = await answerQuestion({
    question,
    document,
    fields,
    ocrText: document.ocr_text || '',
  });

  const saved = await db.createChatMessage({
    document_id: document.id,
    user_id: request.user.id,
    question,
    answer: result.answer,
    grounded: result.grounded,
    source: result.source,
    confidence: result.confidence,
  });

  response.status(201).json({
    message: {
      id: saved.id,
      question: saved.question,
      answer: saved.answer,
      grounded: result.grounded,
      source: result.source,
      confidence: result.confidence,
      provider: result.provider,
      createdAt: saved.created_at,
    },
    suggestions: suggestedQuestions(document.document_type),
  });
});

/** GET /api/documents/:id/chat */
export const getChatHistory = asyncHandler(async (request, response) => {
  const document = assertOwnership(
    await db.getDocument(request.user.id, request.params.id),
    request.user.id,
  );
  const messages = await db.listChatMessages(document.id);

  response.json({
    messages: messages.map((message) => ({
      id: message.id,
      question: message.question,
      answer: message.answer,
      grounded: message.grounded,
      source: message.source,
      createdAt: message.created_at,
    })),
    suggestions: suggestedQuestions(document.document_type),
  });
});

export default { askQuestion, getChatHistory };
