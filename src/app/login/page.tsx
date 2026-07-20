'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/authClient';

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/settings';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const res = await login(username, password);
    if (res.ok) {
      // Only ever return to an in-app path, never an attacker-supplied origin.
      router.push(next.startsWith('/') ? next : '/settings');
      router.refresh();
    } else {
      setError(res.error || 'Login failed');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[70vh] grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 grid place-items-center text-white font-bold text-lg shadow-soft">
            P
          </div>
          <h1 className="mt-3 text-xl font-bold tracking-tight text-slate-900">Sign in</h1>
          <p className="mt-1 text-[12px] text-slate-500">Authenticate to access Data &amp; Backup.</p>
        </div>

        <form onSubmit={onSubmit} className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 space-y-4">
          <div>
            <label htmlFor="username" className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Username
            </label>
            <input
              id="username" name="username" type="text" autoComplete="username" required autoFocus
              value={username} onChange={e => setUsername(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-white border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none text-sm transition-colors"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Password
            </label>
            <input
              id="password" name="password" type="password" autoComplete="current-password" required
              value={password} onChange={e => setPassword(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-white border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none text-sm transition-colors"
            />
          </div>

          {error && (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
              {error}
            </div>
          )}

          <button
            type="submit" disabled={busy}
            className="w-full h-10 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 shadow-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
