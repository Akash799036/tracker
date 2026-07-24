'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';

// Login page. Editing controls across the app stay hidden until a user signs in
// here; viewing never requires a login. On success we send the user back where
// they came from (?from=) or to the dashboard.

function LoginInner() {
  const { user, ready, authConfigured, login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get('from') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already logged in? Nothing to do here — bounce to the destination.
  useEffect(() => {
    if (ready && user) router.replace(from);
  }, [ready, user, from, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await login(email, password);
    setBusy(false);
    if (res.ok) {
      router.replace(from);
    } else {
      setError(res.error || 'Login failed.');
    }
  };

  return (
    <div className="min-h-[70vh] grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white via-brand-50/40 to-white p-6 shadow-sm">
          <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />

          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br from-brand-600 to-brand-700 text-white grid place-items-center shadow-md">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-none">Sign in</h1>
                <p className="mt-1.5 text-[12px] text-slate-600">Authorized users only — sign in to access the dashboard.</p>
              </div>
            </div>

            {!authConfigured && ready && (
              <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-[12px] text-amber-800">
                Login is not configured on the server yet. Set <code className="font-mono">AUTH_SECRET</code> in{' '}
                <code className="font-mono">.env.local</code> and seed users with <code className="font-mono">npm run seed:users</code>.
              </div>
            )}

            <form onSubmit={onSubmit} className="mt-5 space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-[12px] text-rose-700">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Email</label>
                <input
                  type="email"
                  className="fld text-black"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="fld text-black pr-10"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 grid w-10 place-items-center text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 0 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex justify-center">
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex justify-center gap-2 h-10 px-5 rounded-lg bg-gradient-to-br from-brand-600 to-brand-700 text-white text-[13px] font-semibold hover:from-brand-700 hover:to-brand-800 items-center shadow-md hover:shadow-lg transition-all disabled:opacity-60"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                  {busy ? 'Signing in…' : 'Sign in'}
                </button>
              </div>
            </form>
          </div>
        </div>

        <p className="mt-4 text-center text-[11.5px] text-slate-500">
          Access to the dashboard is restricted to authorized users.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams must be inside a Suspense boundary for static generation.
  return (
    <Suspense fallback={<div className="p-6 text-slate-500">Loading…</div>}>
      <LoginInner />
    </Suspense>
  );
}
