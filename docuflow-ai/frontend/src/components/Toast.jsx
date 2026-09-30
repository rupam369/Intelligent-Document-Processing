/**
 * Toast notifications for success / error / warning feedback.
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext(null);

/** How long the exit animation runs before a toast is removed from the DOM. */
const EXIT_MS = 260;

let counter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  // Marks the toast as leaving so the CSS transition can play out first.
  const dismiss = useCallback((id) => {
    setToasts((current) => current.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)));
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, EXIT_MS);
  }, []);

  const push = useCallback(
    ({ title, text, tone = 'info', duration = 5000 }) => {
      const id = ++counter;
      setToasts((current) => [...current, { id, title, text, tone }]);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({
      toast: push,
      success: (title, text) => push({ title, text, tone: 'success' }),
      error: (title, text) => push({ title, text, tone: 'error', duration: 7000 }),
      warning: (title, text) => push({ title, text, tone: 'warning' }),
      info: (title, text) => push({ title, text, tone: 'info' }),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone} ${toast.leaving ? 'leaving' : ''}`.trim()}>
            <div className="toast-body">
              {toast.title ? <div className="toast-title">{toast.title}</div> : null}
              {toast.text ? <div className="toast-text">{toast.text}</div> : null}
            </div>
            <button className="alert-close" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a ToastProvider.');
  return context;
}

export default useToast;
