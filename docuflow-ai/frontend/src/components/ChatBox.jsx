/**
 * Document chat box.
 *
 * Answers are grounded in the document's extracted fields and OCR text. When
 * the information is not present the assistant says so instead of guessing.
 */
import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';

export default function ChatBox({ documentId, documentType, disabled = false }) {
  const [messages, setMessages] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .chatHistory(documentId)
      .then((payload) => {
        if (cancelled) return;
        setMessages(payload.messages || []);
        setSuggestions(payload.suggestions || []);
      })
      .catch((historyError) => !cancelled && setError(historyError.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  async function ask(text) {
    const trimmed = (text ?? question).trim();
    if (!trimmed || sending) return;

    setQuestion('');
    setSending(true);
    setError(null);

    // Optimistically show the user's question.
    const optimistic = {
      id: `pending-${Date.now()}`,
      question: trimmed,
      answer: null,
      pending: true,
    };
    setMessages((current) => [...current, optimistic]);

    try {
      const payload = await api.chat(documentId, trimmed);
      setMessages((current) =>
        current.map((message) => (message.id === optimistic.id ? payload.message : message)),
      );
      if (payload.suggestions?.length) setSuggestions(payload.suggestions);
    } catch (chatError) {
      setError(chatError.message);
      setMessages((current) => current.filter((message) => message.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-shell">
      <div className="chat-messages">
        {loading ? (
          <div className="chat-empty">Loading conversation...</div>
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            <strong style={{ display: 'block', color: 'var(--text)', marginBottom: 4 }}>
              Ask anything about this document
            </strong>
            Answers come only from the extracted data and OCR text of this document.
            {suggestions.length ? (
              <div className="chat-suggestions">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    className="chip"
                    disabled={disabled || sending}
                    onClick={() => ask(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="stack sm">
              <div className="chat-msg user">
                <div className="chat-bubble">{message.question}</div>
              </div>
              <div className={`chat-msg assistant ${message.grounded === false ? 'ungrounded' : ''}`}>
                {message.pending ? (
                  <div className="chat-bubble">
                    <span className="typing">
                      <span />
                      <span />
                      <span />
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="chat-bubble">{message.answer}</div>
                    {message.grounded === false ? (
                      <span className="chat-meta">Not found in this document</span>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      {error ? (
        <div className="alert danger" style={{ margin: '0 16px 10px' }}>
          <span className="alert-icon">!</span>
          <div className="alert-body">
            <div className="alert-text">{error}</div>
          </div>
        </div>
      ) : null}

      <form
        className="chat-input-row"
        onSubmit={(event) => {
          event.preventDefault();
          ask();
        }}
      >
        <input
          type="text"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={disabled ? 'Chat is available once processing completes' : 'Ask about this document...'}
          disabled={disabled || sending}
          aria-label="Ask a question about this document"
        />
        <button className="btn primary" type="submit" disabled={disabled || sending || !question.trim()}>
          {sending ? <span className="spinner" /> : null}
          {sending ? 'Thinking' : 'Ask'}
        </button>
      </form>
    </div>
  );
}
