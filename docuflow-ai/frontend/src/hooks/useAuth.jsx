/**
 * Authentication context.
 *
 * Holds the signed-in user, exposes sign-in / sign-up / sign-out helpers and
 * keeps localStorage in sync. Protected routes redirect to /login when there is
 * no session.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore, userStore } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => userStore.get());
  const [initialising, setInitialising] = useState(true);

  // Validate a stored token once on boot.
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!tokenStore.get()) {
        setInitialising(false);
        return;
      }
      try {
        const payload = await api.me();
        if (cancelled) return;
        setUser(payload.user);
        userStore.set(payload.user);
      } catch {
        tokenStore.clear();
        userStore.clear();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setInitialising(false);
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const payload = await api.login(credentials);
    tokenStore.set(payload.session.access_token);
    userStore.set(payload.user);
    setUser(payload.user);
    return payload;
  }, []);

  const register = useCallback(async (details) => {
    const payload = await api.register(details);
    if (payload.session?.access_token) {
      tokenStore.set(payload.session.access_token);
      userStore.set(payload.user);
      setUser(payload.user);
    }
    return payload;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* ignore - the token is discarded locally regardless */
    }
    tokenStore.clear();
    userStore.clear();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, initialising, login, register, logout, isAuthenticated: Boolean(user) }),
    [user, initialising, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider.');
  return context;
}

export default useAuth;
