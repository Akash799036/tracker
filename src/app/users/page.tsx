'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/lib/toast';
import { useConfirm } from '@/lib/confirm';

// User Management (super-admin only).
//
// Super Admins create and manage General User accounts here. General Users can
// only use the submission form; this page lets an admin add them, reset their
// passwords, and remove them. The authoritative gate is requireSuperAdmin() on
// /api/users — this page only hides itself from non-admins to avoid a useless
// screen, and redirects them away.

type ManagedUser = {
  id: number;
  email: string;
  name?: string;
  role: number;
  createdAt: string;
};

const ROLE_SUPER_ADMIN = 1;
const ROLE_GENERAL_USER = 2;

function roleLabel(role: number): string {
  return role === ROLE_SUPER_ADMIN ? 'Super Admin' : 'General User';
}

export default function UsersPage() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { ready: authReady, isSuperAdmin } = useAuth();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Create-user form state. Role defaults to General User — the most common case.
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<number>(ROLE_GENERAL_USER);
  const [creating, setCreating] = useState(false);

  // Non-super-admins never see this page. The middleware already blocks general
  // users; a signed-in selected non-admin (there are none today, but the model
  // allows them) is sent home rather than shown an empty screen.
  useEffect(() => {
    if (authReady && !isSuperAdmin) router.replace('/');
  }, [authReady, isSuperAdmin, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setUsers(json.users ?? []);
      else toast.error(json?.error || 'Could not load users.');
    } catch {
      toast.error('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (authReady && isSuperAdmin) load();
  }, [authReady, isSuperAdmin, load]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error('Email and password are required.');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Role is chosen by the super admin below. The API re-validates it and
        // coerces anything other than the two known roles to General User.
        body: JSON.stringify({ email: email.trim(), name: name.trim(), password, role }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error || 'Could not create the user.');
        return;
      }
      toast.success(`Created ${email.trim()} as ${roleLabel(role)}.`);
      setEmail('');
      setName('');
      setPassword('');
      setRole(ROLE_GENERAL_USER);
      await load();
    } catch {
      toast.error('Could not reach the server.');
    } finally {
      setCreating(false);
    }
  };

  const onResetPassword = async (u: ManagedUser) => {
    const next = window.prompt(`New password for ${u.email} (min 8 characters):`);
    if (next === null) return; // cancelled
    if (next.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    try {
      const res = await fetch(`/api/users/${u.id}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error || 'Could not reset the password.');
        return;
      }
      toast.success(`Password updated for ${u.email}.`);
    } catch {
      toast.error('Could not reach the server.');
    }
  };

  const onDelete = async (u: ManagedUser) => {
    const ok = await confirm({
      title: `Delete ${u.email}?`,
      message: 'This removes their account. They will no longer be able to log in.',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error || 'Could not delete the user.');
        return;
      }
      toast.success(`Deleted ${u.email}.`);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch {
      toast.error('Could not reach the server.');
    }
  };

  if (!authReady || !isSuperAdmin) {
    return <div className="min-h-[40vh] grid place-items-center text-sm text-slate-500">Loading…</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">User Management</h1>
        <p className="mt-1 text-[13px] text-slate-600">
          Create and manage General User accounts. General Users can only access
          the submission form.
        </p>
      </div>

      {/* Create user */}
      <form
        onSubmit={onCreate}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4"
      >
        <h2 className="text-sm font-semibold text-slate-800">Add a user</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-slate-600">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              placeholder="person@webart.technology"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-slate-600">Name (optional)</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              placeholder="Full name"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-slate-600">Password</span>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Min 8 characters"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-slate-600">Role</span>
            <select
              value={role}
              onChange={(e) => setRole(Number(e.target.value))}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            >
              <option value={ROLE_GENERAL_USER}>General User — form only</option>
              <option value={ROLE_SUPER_ADMIN}>Super Admin — full access</option>
            </select>
          </label>
        </div>
        {role === ROLE_SUPER_ADMIN && (
          <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Super Admins get full access, including this User Management page. Only
            grant this to trusted team members.
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={creating}
            className="h-10 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 shadow-sm disabled:opacity-60"
          >
            {creating ? 'Creating…' : 'Create user'}
          </button>
        </div>
      </form>

      {/* User list */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-800">
            Users {users.length > 0 && <span className="text-slate-400">({users.length})</span>}
          </h2>
          <button
            onClick={load}
            className="text-[12px] font-medium text-brand-600 hover:text-brand-700"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading users…</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No users yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-2.5 font-semibold">User</th>
                  <th className="px-5 py-2.5 font-semibold">Role</th>
                  <th className="px-5 py-2.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-800">{u.name || u.email}</div>
                      {u.name && <div className="text-[12px] text-slate-500">{u.email}</div>}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          u.role === ROLE_SUPER_ADMIN
                            ? 'bg-brand-50 text-brand-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {roleLabel(u.role)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => onResetPassword(u)}
                          className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Reset password
                        </button>
                        <button
                          onClick={() => onDelete(u)}
                          className="h-8 rounded-lg border border-rose-200 bg-white px-3 text-[12px] font-semibold text-rose-600 hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
