'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { encryptCredentials } from './loginCryptoClient';

// Client-side auth state.
//
// Mirrors the server session cookie: on mount it asks /api/auth/me who (if
// anyone) is logged in, and exposes login/logout that call the auth API and
// update the cached user. Every editable surface reads `canEdit` from here to
// decide whether to show its controls — but this is only UX. The real gate is
// requireAuth() on the mutating API routes, so a hidden button is a convenience,
// not a security control.

export type AuthUser = { username: string };

type AuthState = {
  user: AuthUser | null;
  /** True once the initial /api/auth/me check has resolved. */
  ready: boolean;
  /** Whether the server has login configured at all (AUTH_SECRET etc.). */
  authConfigured: boolean;
  /** Convenience: a logged-in user may edit; everyone else is read-only. */
  canEdit: boolean;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [authConfigured, setAuthConfigured] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        setUser(json?.user ?? null);
        setAuthConfigured(Boolean(json?.authConfigured));
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    try {
      // Encrypt the credentials so they don't show as plaintext in the network
      // Payload tab. If encryption isn't available, fall back to plaintext —
      // TLS still protects it on the wire. The server accepts either shape.
      const enc = await encryptCredentials(username, password);
      const body = enc ? { enc } : { username, password };
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: json?.error || 'Login failed.' };
      setUser(json?.user ?? { username });
      setAuthConfigured(true);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Could not reach the server.' };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* clear locally regardless */
    }
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(() => ({
    user,
    ready,
    authConfigured,
    canEdit: user !== null,
    login,
    logout,
    refresh,
  }), [user, ready, authConfigured, login, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
