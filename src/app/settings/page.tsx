import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, readSessionToken } from '@/lib/auth';
import SettingsClient from './SettingsClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Server-side guard. middleware.ts already redirects unauthenticated visitors,
// but this re-checks at render time so the page is never served without a
// valid session even if the middleware matcher is changed or bypassed.
export default async function SettingsPage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!readSessionToken(token)) redirect('/login?next=%2Fsettings');
  return <SettingsClient />;
}
