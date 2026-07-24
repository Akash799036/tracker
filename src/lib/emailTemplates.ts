import 'server-only';

// HTML email templates for outgoing notifications.
//
// Email HTML is NOT web HTML: Gmail strips <style> blocks and <head>, Outlook
// renders through Word's engine (no flexbox/grid, shaky padding on <div>), and
// dark-mode clients recolor bare text. So everything here is TABLE-based with
// INLINE styles, fixed pixel widths, and a centered card on a neutral canvas —
// the layout every major client renders consistently. Keep new sections in the
// same idiom (a full-width <table>, then an inner max-640 card table).

// Brand palette — mirrors tailwind.config.ts `brand`. Duplicated as plain hex
// because email clients can't read the Tailwind theme.
const BRAND = '#2748e0';
const BRAND_DARK = '#1f38b8';
const INK = '#0f172a'; // slate-900
const MUTED = '#64748b'; // slate-500
const SUBTLE = '#475569'; // slate-600
const LINE = '#e2e8f0'; // slate-200
const CANVAS = '#f1f5f9'; // slate-100
const CARD = '#ffffff';
const PANEL = '#f8fafc'; // slate-50

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export type EmailField = { label: string; value: string };
export type EmailCredGroup = {
  title: string;
  url?: string;
  username?: string;
  password?: string;
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// A "key : value" row used inside the panels below. `mono` renders the value in
// a monospace face — for logins, IDs, anything meant to be copied verbatim.
function kvRow(label: string, valueHtml: string, mono = false): string {
  return `
    <tr>
      <td style="padding:7px 16px 7px 0;color:${MUTED};font-size:13px;line-height:1.4;vertical-align:top;white-space:nowrap;">${escapeHtml(
        label
      )}</td>
      <td style="padding:7px 0;color:${INK};font-size:13px;line-height:1.5;vertical-align:top;${
        mono
          ? "font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;word-break:break-all;"
          : 'word-break:break-word;'
      }">${valueHtml}</td>
    </tr>`;
}

// A section heading: an uppercase label paired with a hairline rule that fills
// the remaining width. Reads as a considered editorial divider rather than the
// ubiquitous coloured accent-bar-on-a-card. The rule is a bottom border on a
// full-width cell, which every major client (incl. Outlook) honours.
function sectionHeading(title: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:2px 0 14px;">
      <tr>
        <td style="padding:0 12px 0 0;color:${MUTED};font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;">${escapeHtml(
          title
        )}</td>
        <td style="padding:0;width:100%;border-bottom:1px solid ${LINE};font-size:0;line-height:0;">&nbsp;</td>
      </tr>
    </table>`;
}

// A rounded, bordered panel used to wrap a titled table (credential groups,
// the full-submission table). Nesting a table inside gives Outlook stable
// padding that a plain <div> would not.
function panel(inner: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ${LINE};border-radius:10px;background:${PANEL};margin:0 0 14px;">
      <tr><td style="padding:14px 16px;">${inner}</td></tr>
    </table>`;
}

/**
 * The "website is live" notification. `projectName`, `websiteUrl`, credential
 * groups and the full submission are all optional except the project name — the
 * template renders only the sections that have content.
 */
export function websiteLiveEmailHtml(input: {
  projectName: string;
  websiteUrl?: string;
  submitter?: string;
  credGroups: EmailCredGroup[];
  fields: EmailField[];
}): string {
  const { projectName, websiteUrl, submitter, credGroups, fields } = input;
  const safeName = escapeHtml(projectName);

  // Hero: the headline + a prominent "Visit website" button when we have a URL.
  const heroButton = websiteUrl
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 4px;">
        <tr>
          <td style="border-radius:8px;background:${BRAND};">
            <a href="${escapeHtml(websiteUrl)}"
               style="display:inline-block;padding:11px 22px;font-family:${FONT};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
              Visit website &rarr;
            </a>
          </td>
        </tr>
      </table>`
    : '';

  const websiteLine = websiteUrl
    ? `<p style="margin:14px 0 0;font-size:13px;line-height:1.5;color:${MUTED};">
         Live at
         <a href="${escapeHtml(websiteUrl)}" style="color:${BRAND};font-weight:600;text-decoration:none;word-break:break-all;">${escapeHtml(
           websiteUrl
         )}</a>
       </p>`
    : '';

  // Credential groups — each in its own titled panel, values in monospace.
  const credSection = credGroups.length
    ? sectionHeading('Login credentials') +
      credGroups
        .map((g) => {
          const rows = [
            g.url
              ? kvRow(
                  'URL',
                  `<a href="${escapeHtml(g.url)}" style="color:${BRAND};text-decoration:none;word-break:break-all;">${escapeHtml(
                    g.url
                  )}</a>`
                )
              : '',
            g.username ? kvRow('Username', escapeHtml(g.username), true) : '',
            g.password ? kvRow('Password', escapeHtml(g.password), true) : '',
          ].join('');
          return panel(
            `<div style="font-weight:700;color:${INK};font-size:13px;margin:0 0 8px;">${escapeHtml(
              g.title
            )}</div>
             <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>`
          );
        })
        .join('')
    : '';

  // Full submission — every submitted field, zebra-striped for scannability.
  const submissionRows = fields
    .map(
      ({ label, value }, i) => `
      <tr style="background:${i % 2 ? PANEL : CARD};">
        <td style="padding:9px 16px 9px 14px;color:${MUTED};font-size:13px;line-height:1.4;vertical-align:top;white-space:nowrap;border-bottom:1px solid ${LINE};">${escapeHtml(
          label
        )}</td>
        <td style="padding:9px 14px 9px 0;color:${INK};font-size:13px;line-height:1.5;vertical-align:top;word-break:break-word;border-bottom:1px solid ${LINE};">${escapeHtml(
          value
        )}</td>
      </tr>`
    )
    .join('');

  const submissionSection = fields.length
    ? sectionHeading('Full submission') +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ${LINE};border-radius:10px;border-collapse:separate;overflow:hidden;">${submissionRows}</table>`
    : '';

  const replyLine = submitter
    ? `<p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:${MUTED};">
         Submitted by <a href="mailto:${escapeHtml(submitter)}" style="color:${SUBTLE};text-decoration:none;">${escapeHtml(
           submitter
         )}</a> — reply to this email to reach them.
       </p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Website is live</title>
</head>
<body style="margin:0;padding:0;background:${CANVAS};">
  <!-- Preheader: the preview snippet shown in the inbox list, hidden in-body. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    ${safeName} is now live${websiteUrl ? ` — ${escapeHtml(websiteUrl)}` : ''}.
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${CANVAS};">
    <tr>
      <td align="center" style="padding:28px 16px;">

        <!-- Card -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="width:640px;max-width:100%;background:${CARD};border:1px solid ${LINE};border-radius:16px;overflow:hidden;">

          <!-- Header band -->
          <tr>
            <td style="background:${BRAND};background-image:linear-gradient(135deg,${BRAND} 0%,${BRAND_DARK} 100%);padding:22px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-family:${FONT};color:#ffffff;font-size:15px;font-weight:700;letter-spacing:-.01em;">ProjectTracker</td>
                  <td align="right" style="font-family:${FONT};color:#c7d2fe;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;">Live notification</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero -->
          <tr>
            <td style="padding:28px 28px 8px;font-family:${FONT};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="width:44px;vertical-align:top;" width="44">
                    <div style="width:44px;height:44px;border-radius:12px;background:#eef4ff;text-align:center;line-height:44px;font-size:22px;">&#127881;</div>
                  </td>
                  <td style="padding-left:14px;vertical-align:middle;">
                    <div style="color:${INK};font-size:20px;font-weight:700;line-height:1.25;letter-spacing:-.01em;">Website is now live</div>
                    <div style="color:${SUBTLE};font-size:14px;line-height:1.5;margin-top:3px;"><strong style="color:${INK};">${safeName}</strong> has gone live.</div>
                  </td>
                </tr>
              </table>
              ${heroButton}
              ${websiteLine}
            </td>
          </tr>

          <!-- Body sections -->
          <tr>
            <td style="padding:20px 28px 8px;font-family:${FONT};">
              ${credSection}
              ${submissionSection}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:18px 28px 24px;border-top:1px solid ${LINE};font-family:${FONT};">
              ${replyLine}
              <p style="margin:0;font-size:12px;line-height:1.5;color:${MUTED};">
                This is an automated notification from ProjectTracker.
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>
</body>
</html>`;
}
