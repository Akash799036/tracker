'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

// Client-side view of the session. This drives UI visibility only — the real
// enforcement is middleware.ts plus the server-side checks in the API routes.

type AuthState = {
  authenticated: boolean;
  username: string | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session', { cache: 'no-store' });
      const data = await res.json();
      setAuthenticated(Boolean(data.authenticated));
      setUsername(data.username ?? null);
    } catch {
      setAuthenticated(false);
      setUsername(null);
    } finally {
      setReady(true);
    }
  }, []);

  // Check on mount, then keep a valid session slid forward while a tab stays
  // open: re-check hourly and whenever the tab regains focus. Each check hits
  // /api/auth/session, which re-issues the cookie when it's due (see that
  // route), so an actively-used session never lapses mid-work.
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60 * 60 * 1000); // hourly
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const login = useCallback(async (u: string, p: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error || 'Login failed' };
      setAuthenticated(true);
      setUsername(data.username ?? u);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Login failed' };
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setAuthenticated(false);
    setUsername(null);
  }, []);

  return (
    <AuthContext.Provider value={{ authenticated, username, ready, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
