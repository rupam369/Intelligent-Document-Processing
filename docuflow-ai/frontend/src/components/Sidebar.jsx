/**
 * Primary navigation sidebar.
 */
import { NavLink, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '../services/api.js';

const LINKS = [
  { to: '/dashboard', label: 'Dashboard', icon: '◧' },
  { to: '/documents', label: 'Documents', icon: '▤' },
  { to: '/upload', label: 'Upload', icon: '↑' },
  { to: '/review', label: 'Review', icon: '✓', badge: 'review' },
  { to: '/analytics', label: 'Analytics', icon: '◔' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

export default function Sidebar({ open, onClose, reviewCount = 0 }) {
  const [capabilities, setCapabilities] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .capabilities()
      .then((payload) => !cancelled && setCapabilities(payload))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const demoMode = capabilities?.demoMode;

  return (
    <>
      {open ? <div className="sidebar-backdrop" onClick={onClose} /> : null}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <Link to="/dashboard" className="sidebar-brand" onClick={onClose}>
          <span className="navbar-logo">DF</span>
          DocuFlow AI
        </Link>

        <nav className="sidebar-nav">
          <div className="sidebar-label">Workspace</div>
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={onClose}
            >
              <span className="icon">{link.icon}</span>
              {link.label}
              {link.badge === 'review' && reviewCount > 0 ? (
                <span className="sidebar-badge">{reviewCount}</span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          {demoMode ? (
            <div className="sidebar-card">
              <strong>Demo mode active</strong>
              No Supabase / AI keys configured. The built-in engine is being used so the full pipeline still runs.
            </div>
          ) : (
            <div className="sidebar-card">
              <strong>Production engines</strong>
              Supabase, storage and your configured AI / OCR provider are live.
            </div>
          )}
          <div className="sidebar-card tiny">
            <strong>Processing pipeline</strong>
            Upload → OCR → Classify → Extract → Validate → Review
          </div>
        </div>
      </aside>
    </>
  );
}
