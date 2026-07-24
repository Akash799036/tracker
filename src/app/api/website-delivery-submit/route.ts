import { NextResponse } from 'next/server';
import { badRequest, fail } from '@/lib/apiHelpers';
import { insertUserRow } from '@/lib/sheetData';
import { encryptField } from '@/lib/fieldCrypto';
import { sendMail, adminEmail } from '@/lib/email';
import { websiteLiveEmailHtml } from '@/lib/emailTemplates';
import { appendLiveProjectRow } from '@/lib/googleSheets';
import {
  WEBSITE_DELIVERY_FIELDS,
  EMAIL_FIELD,
  type FormField,
} from '@/lib/websiteDeliveryForm';

// Live Projects submission endpoint.
//
// A submission from the Website Delivery / Live Projects form does three things:
//   1. lands as a row on the LIVE PROJECTS page (the `live-projects` store), so
//      it shows up on that page's table;
//   2. emails the admin that a new project was submitted;
//   3. appends the same row to the real Live Projects Google Sheet.
//
// Only (1) is required to succeed — the row is the source of truth. Email and the
// Google Sheet append are best-effort: if either is unconfigured or fails, the
// submission still succeeds and we report which side-effects went through.

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Where Live Projects submissions live in our own store.
const LIVE_PROJECTS_PAGE_KEY = 'live-projects';
const LIVE_PROJECTS_SHEET_TAB = 'Live Projects';

// Every field the form can submit, keyed by its `name`, so we can resolve a
// submitted key to its label / type / encrypted flag.
const ALL_FIELDS: FormField[] = [EMAIL_FIELD, ...WEBSITE_DELIVERY_FIELDS];
const FIELD_BY_NAME = new Map(ALL_FIELDS.map(f => [f.name, f]));

// --- Abuse protection ------------------------------------------------------
//
// This endpoint is intentionally open to the public (general users submit the
// Live Projects form without logging in), so it needs its own light abuse
// guard rather than relying on auth.
//
// (a) Honeypot: the form renders a hidden field with this name that a human
//     never fills. A bot that fills every input trips it — we then return a
//     fake success (201) and save nothing, so the bot can't tell it was caught.
export const HONEYPOT_FIELD = 'company_website_hp';

// (b) Rate limit: a small in-memory sliding window per client IP. Single-instance
//     app, so an in-process map is sufficient (it resets on redeploy, which is
//     fine for spam mitigation — this is not a security boundary).
const RATE_LIMIT_MAX = 5;              // submissions ...
const RATE_LIMIT_WINDOW_MS = 60_000;   // ... per this window, per IP
const rateHits = new Map<string, number[]>();

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** True if this IP has exceeded the allowed submissions in the current window. */
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const hits = (rateHits.get(ip) || []).filter(t => t > cutoff);
  if (hits.length >= RATE_LIMIT_MAX) {
    rateHits.set(ip, hits); // keep the pruned list so it eventually empties
    return true;
  }
  hits.push(now);
  rateHits.set(ip, hits);
  // Opportunistically drop empty entries so the map doesn't grow unbounded.
  if (rateHits.size > 5000) {
    for (const [k, v] of rateHits) if (!v.some(t => t > cutoff)) rateHits.delete(k);
  }
  return false;
}

/** Coerce a cells payload to strings, ignoring anything that is not one. */
function readCells(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (v == null) continue;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        const s = String(v).trim();
        if (s) out[k] = s;
      }
    }
  }
  return out;
}

/**
 * Re-key a submission from field `name` to human label — the Live Projects page
 * and Google Sheet read by label, not machine name. Encrypted secrets are
 * encrypted for our own store but masked before they leave for email / the
 * external sheet. Returns three views of the same submission.
 */
function project(cells: Record<string, string>) {
  const forStore: Record<string, string> = {}; // label -> value (secrets encrypted)
  const forSheet: Record<string, string> = {}; // label -> value (secrets masked)
  const forEmail: Array<{ label: string; value: string }> = [];

  for (const [name, value] of Object.entries(cells)) {
    const field = FIELD_BY_NAME.get(name);
    const label = field?.label ?? name;
    if (field?.encrypted) {
      forStore[label] = encryptField(value);
      forSheet[label] = '••••••••';
      forEmail.push({ label, value: '••••••••' });
    } else {
      forStore[label] = value;
      forSheet[label] = value;
      forEmail.push({ label, value });
    }
  }
  return { forStore, forSheet, forEmail };
}

/** A URL string, normalized to include a scheme so it links correctly. */
function href(url: string): string {
  const u = url.trim();
  if (!u) return '';
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

/**
 * The credential groups a delivery can carry. Each reads its values straight
 * from the raw (pre-encryption) submission by field `name`, so the email shows
 * the real login details rather than the masked/encrypted store values. A group
 * is only emailed when at least one of its fields was actually submitted.
 */
type CredGroup = { title: string; urlName: string; userName: string; passName: string };
const CREDENTIAL_GROUPS: CredGroup[] = [
  { title: 'Site / Admin login', urlName: 'admin_url',          userName: 'admin_username',        passName: 'admin_password' },
  { title: 'Domain portal',      urlName: 'domain_portal_url',  userName: 'domain_username',       passName: 'domain_password' },
  { title: 'Hosting / cPanel',   urlName: 'hosting_cpanel_url', userName: 'hosting_cpanel_username', passName: 'hosting_cpanel_password' },
];

// POST /api/website-delivery-submit  { cells, [honeypot] }  (cells keyed by field name)
//
// Public endpoint: general users submit the Live Projects form without logging
// in. Protected by a honeypot field and a per-IP rate limit (see above) rather
// than auth.
export async function POST(req: Request) {
  // Rate limit first, before doing any work.
  if (rateLimited(clientIp(req))) {
    return NextResponse.json(
      { error: 'Too many submissions. Please wait a minute and try again.' },
      { status: 429 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));

    // Honeypot: a real user never fills this hidden field. If it's non-empty,
    // pretend the submission succeeded but save nothing — the bot gets a 201 and
    // no signal that it was blocked.
    const honeypot = body?.[HONEYPOT_FIELD];
    if (typeof honeypot === 'string' && honeypot.trim()) {
      return NextResponse.json({ row: null, emailed: false, sheeted: false }, { status: 201 });
    }

    const cells = readCells(body?.cells);
    if (!Object.keys(cells).length) return badRequest('cells is required');

    const { forStore, forSheet, forEmail } = project(cells);

    // (1) Required: persist as a Live Projects row. If this throws, the whole
    // request fails and the client shows an error — nothing was saved.
    const row = await insertUserRow(LIVE_PROJECTS_PAGE_KEY, LIVE_PROJECTS_SHEET_TAB, forStore);
    if (!row) return fail(new Error('could not save the submission'));

    // (2) & (3): best-effort side-effects. Run them together; a failure here
    // does not fail the submission.
    const projectName = forStore['Project Name'] || forStore['Project name'] || 'New project';
    const submitter = cells[EMAIL_FIELD.name] || '';

    // The website's public address. There's no single "website link" field, so
    // fall back through the most public URL a delivery carries: the live domain,
    // then the admin URL.
    const websiteUrl = href(cells['domain_name'] || cells['admin_url'] || '');

    // Credential groups that were actually submitted, read from the raw plaintext
    // cells (not the masked store values) so the admin gets the real logins.
    const credGroups = CREDENTIAL_GROUPS
      .map(g => ({
        title: g.title,
        url: (cells[g.urlName] || '').trim(),
        username: (cells[g.userName] || '').trim(),
        password: (cells[g.passName] || '').trim(),
      }))
      .filter(g => g.url || g.username || g.password);

    // --- Plain-text body ---
    const textLines: string[] = [
      `The website for "${projectName}" is now live. 🎉`,
      '',
    ];
    if (websiteUrl) textLines.push(`Website: ${websiteUrl}`, '');
    if (credGroups.length) {
      textLines.push('Login credentials:');
      for (const g of credGroups) {
        textLines.push(`  ${g.title}`);
        if (g.url) textLines.push(`    URL: ${href(g.url)}`);
        if (g.username) textLines.push(`    Username: ${g.username}`);
        if (g.password) textLines.push(`    Password: ${g.password}`);
      }
      textLines.push('');
    }
    // Full submission, for reference / handover.
    textLines.push('Full submission:');
    textLines.push(...forEmail.map(({ label, value }) => `  ${label}: ${value}`));
    const text = textLines.join('\n');

    // --- HTML body ---
    // Composed by the shared, email-client-safe template (src/lib/emailTemplates.ts).
    // URLs are normalized to include a scheme so they link correctly.
    const html = websiteLiveEmailHtml({
      projectName,
      websiteUrl: websiteUrl || undefined,
      submitter: submitter || undefined,
      credGroups: credGroups.map(g => ({
        title: g.title,
        url: g.url ? href(g.url) : undefined,
        username: g.username || undefined,
        password: g.password || undefined,
      })),
      fields: forEmail,
    });

    const [emailed, sheeted] = await Promise.all([
      sendMail({
        subject: `Website live: ${projectName}`,
        replyTo: submitter || undefined,
        text,
        html,
      }),
      appendLiveProjectRow(forSheet),
    ]);

    return NextResponse.json({ row, emailed, sheeted }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
