'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';

// Access Denied screen.
//
// Shown to a General User (role 2) who tries to reach any page other than the
// submission form. The middleware (src/middleware.ts) is the authoritative gate
// and REWRITES restricted page requests to this route — so the URL the user
// typed stays in the address bar while this message is displayed.
//
// The form link points a general user back to where they belong. Logout is
// offered so a user who reached the wrong place can switch accounts.
export default function AccessDeniedPage() {
  const router = useRouter();
  const { logout } = useAuth();

  const onLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <div className="min-h-[70vh] grid place-items-center">
      <div className="max-w-md w-full text-center rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-red-50 text-red-600">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-slate-900">Access Denied</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your account doesn&rsquo;t have permission to view this page. You can
          only access the submission form.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/website-delivery-2"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 shadow-sm"
          >
            Go to the form
          </Link>
          <button
            onClick={onLogout}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
