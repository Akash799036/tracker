import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { badRequest, fail } from '@/lib/apiHelpers';
import { insertUserRow } from '@/lib/sheetData';
import { encryptField } from '@/lib/fieldCrypto';
import { sendMail, adminEmail } from '@/lib/email';
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

// POST /api/website-delivery-submit  { cells }  (cells keyed by field name)
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json().catch(() => ({}));
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
    const rowsHtml = forEmail
      .map(
        ({ label, value }) =>
          `<tr><td style="padding:4px 12px 4px 0;color:#64748b;white-space:nowrap;">${escapeHtml(
            label
          )}</td><td style="padding:4px 0;color:#0f172a;">${escapeHtml(value)}</td></tr>`
      )
      .join('');

    const websiteHtml = websiteUrl
      ? `<p style="margin:0 0 16px;font-size:14px;">
           <span style="color:#64748b;">Website:</span>
           <a href="${escapeHtml(websiteUrl)}" style="color:#2563eb;font-weight:600;">${escapeHtml(websiteUrl)}</a>
         </p>`
      : '';

    const credHtml = credGroups.length
      ? `<h3 style="margin:20px 0 8px;color:#0f172a;font-size:14px;">Login credentials</h3>
         ${credGroups
           .map(
             g => `
             <div style="margin:0 0 12px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
               <div style="font-weight:600;color:#0f172a;font-size:13px;margin-bottom:6px;">${escapeHtml(g.title)}</div>
               <table style="border-collapse:collapse;font-size:13px;">
                 ${g.url ? `<tr><td style="padding:2px 12px 2px 0;color:#64748b;">URL</td><td style="padding:2px 0;"><a href="${escapeHtml(href(g.url))}" style="color:#2563eb;">${escapeHtml(g.url)}</a></td></tr>` : ''}
                 ${g.username ? `<tr><td style="padding:2px 12px 2px 0;color:#64748b;">Username</td><td style="padding:2px 0;color:#0f172a;font-family:monospace;">${escapeHtml(g.username)}</td></tr>` : ''}
                 ${g.password ? `<tr><td style="padding:2px 12px 2px 0;color:#64748b;">Password</td><td style="padding:2px 0;color:#0f172a;font-family:monospace;">${escapeHtml(g.password)}</td></tr>` : ''}
               </table>
             </div>`
           )
           .join('')}`
      : '';

    const [emailed, sheeted] = await Promise.all([
      sendMail({
        subject: `Website live: ${projectName}`,
        replyTo: submitter || undefined,
        text,
        html: `
          <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:640px;">
            <h2 style="margin:0 0 4px;color:#0f172a;font-size:18px;">🎉 Website is now live</h2>
            <p style="margin:0 0 16px;color:#475569;font-size:14px;">
              The website for <strong>${escapeHtml(projectName)}</strong> has gone live.
            </p>
            ${websiteHtml}
            ${credHtml}
            <h3 style="margin:20px 0 8px;color:#0f172a;font-size:14px;">Full submission</h3>
            <table style="border-collapse:collapse;font-size:13px;">${rowsHtml}</table>
          </div>`,
      }),
      appendLiveProjectRow(forSheet),
    ]);

    return NextResponse.json({ row, emailed, sheeted }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
