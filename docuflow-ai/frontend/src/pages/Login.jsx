/**
 * Login page.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import useToast from '../components/Toast.jsx';
import { ErrorState } from '../components/States.jsx';

const FEATURES = [
  { icon: '⌬', title: 'OCR & vision ingestion', text: 'PDF, JPG and PNG documents' },
  { icon: '◫', title: 'AI classification', text: 'Invoices, receipts, resumes, contracts and more' },
  { icon: '✓', title: 'Validation & human review', text: 'Catch discrepancies before they cost you' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(form);
      toast.success('Welcome back', 'You are signed in.');
      navigate('/dashboard', { replace: true });
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="df-aurora" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <div className="auth-hero">
        <div className="row" style={{ gap: 10 }}>
          <span className="navbar-logo" style={{ background: 'rgba(255,255,255,0.2)' }}>DF</span>
          <strong style={{ fontSize: 15 }}>DocuFlow AI</strong>
        </div>
        <h1>Turn unstructured documents into validated, searchable data.</h1>
        <p>
          Upload a document, let the pipeline read and classify it, extract structured fields, validate the
          numbers, and chat with it - all in one workspace.
        </p>
        <div className="auth-features">
          {FEATURES.map((feature, index) => (
            <div key={feature.title} className="auth-feature" style={{ '--i': index }}>
              <span className="auth-feature-icon">{feature.icon}</span>
              <div>
                <strong>{feature.title}</strong>
                <span>{feature.text}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="auth-panel">
        <div className="auth-card">
          <h2>Sign in</h2>
          <p className="auth-sub">Access your document workspace.</p>

          {error ? <ErrorState message={error} /> : null}

          <form onSubmit={handleSubmit} style={{ marginTop: error ? 16 : 0 }}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="you@company.com"
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder="••••••••"
              />
            </div>

            <button className="btn primary block" type="submit" disabled={busy}>
              {busy ? <span className="spinner" /> : null}
              {busy ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="demo-credentials">
            <strong>Demo account</strong>
            The platform ships with a seeded demo workspace.
            <code>demo@docuflow.ai / demo1234</code>
          </div>

          <p className="auth-footer-text">
            New here? <Link to="/register">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
