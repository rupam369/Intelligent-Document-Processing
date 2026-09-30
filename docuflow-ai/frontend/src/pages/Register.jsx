/**
 * Registration page.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import useToast from '../components/Toast.jsx';
import { ErrorState } from '../components/States.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (form.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (form.password !== form.confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const payload = await register({
        fullName: form.fullName,
        email: form.email,
        password: form.password,
      });
      if (payload.confirmationRequired) {
        setNotice('Account created. Check your email to confirm your address, then sign in.');
      } else {
        toast.success('Account created', 'Your workspace is ready.');
        navigate('/dashboard', { replace: true });
      }
    } catch (registerError) {
      setError(registerError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-hero">
        <div className="row" style={{ gap: 10 }}>
          <span className="navbar-logo" style={{ background: 'rgba(255,255,255,0.2)' }}>DF</span>
          <strong style={{ fontSize: 15 }}>DocuFlow AI</strong>
        </div>
        <h1>Create your document workspace.</h1>
        <p>
          Every account is isolated. You only ever see the documents, extracted data and chat history that
          belong to you.
        </p>
      </div>

      <div className="auth-panel">
        <div className="auth-card">
          <h2>Create account</h2>
          <p className="auth-sub">Start processing documents in under a minute.</p>

          {error ? <ErrorState message={error} /> : null}
          {notice ? (
            <div className="alert info">
              <span className="alert-icon">i</span>
              <div className="alert-body">
                <div className="alert-text">{notice}</div>
              </div>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} style={{ marginTop: error || notice ? 16 : 0 }}>
            <div className="field">
              <label htmlFor="fullName">Full name</label>
              <input
                id="fullName"
                type="text"
                autoComplete="name"
                value={form.fullName}
                onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                placeholder="Rahul Kumar"
              />
            </div>

            <div className="field">
              <label htmlFor="reg-email">Email</label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="you@company.com"
              />
            </div>

            <div className="field">
              <label htmlFor="reg-password">Password</label>
              <input
                id="reg-password"
                type="password"
                autoComplete="new-password"
                required
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder="At least 8 characters"
              />
            </div>

            <div className="field">
              <label htmlFor="confirm">Confirm password</label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={form.confirm}
                onChange={(event) => setForm({ ...form, confirm: event.target.value })}
                placeholder="Repeat your password"
              />
            </div>

            <button className="btn primary block" type="submit" disabled={busy}>
              {busy ? <span className="spinner" /> : null}
              {busy ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p className="auth-footer-text">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
