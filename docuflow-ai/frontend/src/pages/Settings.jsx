/**
 * Settings page - account, engine configuration and workspace info.
 */
import { useAuth } from '../hooks/useAuth.jsx';
import { useNavigate } from 'react-router-dom';

function EngineRow({ label, value, demo }) {
  return (
    <div className="kv-row">
      <span className="kv-key">{label}</span>
      <span className="kv-value">
        {demo ? <span className="badge warning">Demo</span> : <span className="badge success">Live</span>}
        <span className="small muted" style={{ marginLeft: 8, fontWeight: 500 }}>
          {value}
        </span>
      </span>
    </div>
  );
}

export default function Settings({ capabilities, onRefresh }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const initials = (user?.fullName || user?.email || '?')
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="stack lg">
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Your account and the engines currently powering the pipeline.</p>
        </div>
      </div>

      <div className="detail-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Account</h3>
              <p>Your signed-in identity</p>
            </div>
          </div>
          <div className="card-body">
            <div className="row" style={{ marginBottom: 16 }}>
              <span className="avatar" style={{ width: 44, height: 44, fontSize: 16 }}>
                {initials}
              </span>
              <div>
                <div className="bold">{user?.fullName || 'DocuFlow user'}</div>
                <div className="small muted">{user?.email}</div>
              </div>
            </div>

            <div className="kv-list">
              <div className="kv-row">
                <span className="kv-key">User ID</span>
                <span className="kv-value mono tiny">{user?.id}</span>
              </div>
              <div className="kv-row">
                <span className="kv-key">Sign-in method</span>
                <span className="kv-value" style={{ textTransform: 'capitalize' }}>
                  {user?.provider || 'demo'}
                </span>
              </div>
            </div>

            <div className="divider" />
            <button className="btn" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h3>Processing engines</h3>
              <p>Configured through backend environment variables</p>
            </div>
            <button className="btn ghost sm" onClick={onRefresh}>
              Refresh
            </button>
          </div>
          <div className="card-body">
            <div className="kv-list">
              <EngineRow
                label="Database"
                value={capabilities?.database?.backend}
                demo={capabilities?.database?.demoMode}
              />
              <EngineRow
                label="Document storage"
                value={capabilities?.storage?.backend}
                demo={capabilities?.storage?.demoMode}
              />
              <EngineRow
                label="Authentication"
                value={capabilities?.auth?.backend}
                demo={capabilities?.auth?.demoMode}
              />
              <EngineRow label="AI provider" value={capabilities?.ai?.provider} demo={capabilities?.ai?.demoMode} />
              <EngineRow
                label="OCR / vision provider"
                value={capabilities?.ocr?.provider}
                demo={capabilities?.ocr?.demoMode}
              />
            </div>

            {capabilities?.demoMode ? (
              <div className="alert warning" style={{ marginTop: 16 }}>
                <span className="alert-icon">!</span>
                <div className="alert-body">
                  <div className="alert-title">Demo mode is active</div>
                  <div className="alert-text">
                    Some engines are running on the built-in fallbacks so the platform works without external
                    credentials. Add your Supabase URL, service role key and AI/OCR keys to the backend{' '}
                    <code>.env</code> file, then restart the server to switch to production engines.
                  </div>
                </div>
              </div>
            ) : (
              <div className="alert success" style={{ marginTop: 16 }}>
                <span className="alert-icon">✓</span>
                <div className="alert-body">
                  <div className="alert-title">Production engines active</div>
                  <div className="alert-text">
                    Supabase, storage and your configured AI / OCR provider are handling every request.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>Upload policy</h3>
            <p>Applied by the backend on every upload</p>
          </div>
        </div>
        <div className="card-body">
          <div className="kv-list">
            <div className="kv-row">
              <span className="kv-key">Maximum file size</span>
              <span className="kv-value">{capabilities?.upload?.maxFileSizeMb ?? 15} MB</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Supported formats</span>
              <span className="kv-value">PDF, JPG, PNG</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Storage bucket</span>
              <span className="kv-value">{capabilities?.storage?.bucket || 'documents'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>Security</h3>
            <p>How your data is protected</p>
          </div>
        </div>
        <div className="card-body">
          <ul className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 2 }}>
            <li>API keys never leave the backend - the browser only talks to the DocuFlow API.</li>
            <li>Every route requires a valid session token.</li>
            <li>Row Level Security ensures you can only read and modify your own records.</li>
            <li>Uploads are validated for type, extension and size before they are stored.</li>
            <li>Logs contain metadata only - never document contents or secrets.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
