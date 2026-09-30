/**
 * Application shell + routing.
 */
import { useEffect, useState, useCallback } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import Navbar from './components/Navbar.jsx';
import Sidebar from './components/Sidebar.jsx';
import { DemoModeBanner, Loading } from './components/States.jsx';
import { useAuth } from './hooks/useAuth.jsx';
import { api } from './services/api.js';

import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Documents from './pages/Documents.jsx';
import DocumentDetails from './pages/DocumentDetails.jsx';
import Upload from './pages/Upload.jsx';
import Review from './pages/Review.jsx';
import Analytics from './pages/Analytics.jsx';
import Settings from './pages/Settings.jsx';

/** Redirects to /login when there is no session. */
function Protected({ children }) {
  const { isAuthenticated, initialising } = useAuth();
  const location = useLocation();

  if (initialising) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Loading label="Starting DocuFlow AI..." />
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

export default function App() {
  const { isAuthenticated } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [capabilities, setCapabilities] = useState(null);
  const [reviewCount, setReviewCount] = useState(0);

  const loadCapabilities = useCallback(() => {
    api
      .capabilities()
      .then(setCapabilities)
      .catch(() => {});
  }, []);

  const loadReviewCount = useCallback(() => {
    if (!isAuthenticated) return;
    api
      .reviewQueue()
      .then((payload) => setReviewCount(payload.total || 0))
      .catch(() => {});
  }, [isAuthenticated]);

  useEffect(loadCapabilities, [loadCapabilities]);
  useEffect(loadReviewCount, [loadReviewCount]);

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} reviewCount={reviewCount} />

      <div className="app-main">
        <Navbar onToggleSidebar={() => setSidebarOpen((open) => !open)} />

        <main className="app-content">
          <DemoModeBanner capabilities={capabilities} />

          <Routes>
            <Route path="/dashboard" element={<Dashboard onDocumentsChanged={loadReviewCount} />} />
            <Route path="/documents" element={<Documents onDocumentsChanged={loadReviewCount} />} />
            <Route path="/documents/:id" element={<DocumentDetails onDocumentsChanged={loadReviewCount} />} />
            <Route path="/upload" element={<Upload onUploaded={loadReviewCount} />} />
            <Route path="/review" element={<Review onReviewed={loadReviewCount} />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings capabilities={capabilities} onRefresh={loadCapabilities} />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
