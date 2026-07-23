import 'server-only';
import nodemailer from 'nodemailer';

// Admin email notifications, sent over SMTP via nodemailer.
//
// The app is an internal team tool with a single admin, so email is deliberately
// small: one SMTP transport built from environment variables, one helper that
// composes and sends a notification. If SMTP is not configured, sending is a
// no-op that logs a warning rather than throwing — a submission must never fail
// just because email is unconfigured (the row is already saved by then).
//
// Required env (all read at call time so a dev-server restart isn't needed to
// pick them up beyond the usual .env reload):
//   SMTP_HOST         e.g. smtp.gmail.com
//   SMTP_PORT         e.g. 465 (SSL) or 587 (STARTTLS)
//   SMTP_USER         SMTP login (often the From address)
//   SMTP_PASS         SMTP password / app-password
//   MAIL_FROM         From header, e.g. "Webart Tracker <no-reply@webart.technology>"
//                     (falls back to SMTP_USER)
//   ADMIN_EMAIL       where notifications are delivered (falls back to MAIL_FROM/SMTP_USER)

type MailInput = {
  subject: string;
  text: string;
  html?: string;
  /** Override recipient; defaults to ADMIN_EMAIL. */
  to?: string;
  /** Reply-To header, e.g. the submitter's email. */
  replyTo?: string;
};

function smtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT?.trim() || '587');
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return {
    host,
    port,
    // 465 is implicit TLS; everything else upgrades via STARTTLS.
    secure: port === 465,
    auth: { user, pass },
  };
}

/** The address notifications are delivered to. */
export function adminEmail(): string | null {
  return (
    process.env.ADMIN_EMAIL?.trim() ||
    process.env.MAIL_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    null
  );
}

let transporter: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter | null {
  const cfg = smtpConfig();
  if (!cfg) return null;
  // Reused across calls within a process. The config is effectively static for
  // the process lifetime, so one transport is fine.
  if (!transporter) transporter = nodemailer.createTransport(cfg);
  return transporter;
}

/**
 * Send a notification email. Returns true on success, false if email is not
 * configured or the send failed — callers treat email as best-effort and never
 * fail the surrounding request on a false return.
 */
export async function sendMail(input: MailInput): Promise<boolean> {
  const transport = getTransport();
  if (!transport) {
    console.warn('[email] SMTP not configured (SMTP_HOST/USER/PASS); skipping notification');
    return false;
  }
  const from = process.env.MAIL_FROM?.trim() || process.env.SMTP_USER!.trim();
  const to = input.to?.trim() || adminEmail();
  if (!to) {
    console.warn('[email] no recipient (ADMIN_EMAIL/MAIL_FROM unset); skipping notification');
    return false;
  }
  try {
    await transport.sendMail({
      from,
      to,
      replyTo: input.replyTo,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return true;
  } catch (e) {
    console.error('[email] send failed:', e instanceof Error ? e.message : e);
    return false;
  }
}
