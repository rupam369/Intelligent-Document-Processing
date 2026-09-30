/**
 * Top navigation bar.
 */
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';

export default function Navbar({ onToggleSidebar, searchValue, onSearch }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const initials = (user?.fullName || user?.email || '?')
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="navbar">
      <div className="row">
        <button className="navbar-toggle" onClick={onToggleSidebar} aria-label="Toggle navigation">
          ☰
        </button>
        <Link to="/dashboard" className="navbar-brand">
          <span className="navbar-logo">DF</span>
          DocuFlow AI
        </Link>
      </div>

      <div className="navbar-right">
        {onSearch ? (
          <div className="navbar-search">
            <span className="subtle">⌕</span>
            <input
              type="search"
              placeholder="Search documents, fields, values..."
              value={searchValue || ''}
              onChange={(event) => onSearch(event.target.value)}
              aria-label="Search documents"
            />
          </div>
        ) : null}

        <div className="navbar-user">
          <span className="avatar">{initials}</span>
          <span className="navbar-email">{user?.email}</span>
          <button className="btn ghost sm" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
