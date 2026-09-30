/**
 * PageTransition - re-mounts route content so the entrance animation replays
 * on every navigation.
 */
import { useLocation } from 'react-router-dom';

export default function PageTransition({ children }) {
  const location = useLocation();

  return (
    <div key={location.pathname} className="df-page">
      {children}
    </div>
  );
}
