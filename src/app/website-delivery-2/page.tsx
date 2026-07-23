'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/lib/toast';
import {
  WEBSITE_DELIVERY_FORM,
  WEBSITE_DELIVERY_FIELDS,
  WEBSITE_DELIVERY_PAGE_KEY,
  EMAIL_FIELD,
  isFieldVisible,
  type FormField,
} from '@/lib/websiteDeliveryForm';

// Every field the form can render, Email first (the built-in system field).
const ALL_FIELDS: FormField[] = [EMAIL_FIELD, ...WEBSITE_DELIVERY_FIELDS];

export default function WebsiteDelivery2Page() {
  const toast = useToast();
  const { ready: authReady } = useAuth();

  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // The Add Project form is open to everyone (signed-out included), so the page
  // no longer redirects unauthenticated visitors to login. Note the submit
  // endpoint is still auth-gated server-side, so a signed-out submit is rejected
  // with an error toast rather than silently failing.

  const set = (name: string, v: string) => {
    setValues(prev => ({ ...prev, [name]: v }));
    setErrors(prev => (prev[name] ? { ...prev, [name]: '' } : prev));
  };

  // Which fields are currently visible given the entered values. Hidden fields
  // are neither rendered nor validated nor submitted.
  const visible = useMemo(
    () => ALL_FIELDS.filter(f => isFieldVisible(f, values)),
    [values]
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate only visible required fields.
    const nextErrors: Record<string, string> = {};
    for (const f of visible) {
      if (f.required && !(values[f.name] ?? '').trim()) {
        nextErrors[f.name] = `${f.label} is required`;
      }
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      toast.error('Please fill in the required fields.');
      return;
    }

    // Submit only visible fields, keyed by field `name` (the stable cell key).
    const cells: Record<string, string> = {};
    for (const f of visible) {
      const v = (values[f.name] ?? '').trim();
      if (v) cells[f.name] = v;
    }

    setSubmitting(true);
    try {
      // The submission lands as a row on the Live Projects page, notifies the
      // admin by email, and is appended to the Live Projects Google Sheet — all
      // handled by this one endpoint.
      const res = await fetch('/api/website-delivery-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cells }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || 'Could not submit the form');
      }
      setValues({});
      setErrors({});
      setSubmitted(true);
    } catch (err: any) {
      toast.error(err?.message || 'Could not submit the form');
    } finally {
      setSubmitting(false);
    }
  };

  // Wait only for auth to resolve; the form itself is shown to everyone.
  if (!authReady) {
    return <div className="p-6 text-slate-500">Loading…</div>;
  }

  // Thank-you screen shown after a successful submission. The row is already on
  // the Live Projects page, the admin has been notified, and the Google Sheet
  // updated — so we offer to view the page or submit another.
  if (submitted) {
    return (
      <div className="max-w-xl mx-auto pt-6">
        <div className="relative overflow-hidden rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-white via-emerald-50/50 to-white p-8 text-center shadow-sm">
          <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Thank you!</h1>
            <p className="mt-2 text-[13px] text-slate-600">
              Your project has been submitted and added to Live Projects. The team
              has been notified by email.
            </p>
            <div className="mt-6 flex items-center justify-center gap-2">
              <Link
                href="/live-projects"
                className="inline-flex h-10 px-5 rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-700 text-white text-[12.5px] font-semibold hover:from-emerald-700 hover:to-emerald-800 items-center shadow-md hover:shadow-lg transition-all"
              >
                View Live Projects
              </Link>
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                className="inline-flex h-10 px-5 rounded-lg border border-slate-200 bg-white text-slate-700 text-[12.5px] font-semibold hover:bg-slate-50 items-center shadow-sm transition-all"
              >
                Submit another
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 max-w-3xl mx-auto">
      {/* Back to Live Projects */}
      <Link
        href="/live-projects"
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-600 hover:text-slate-900 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        Back to Live Projects
      </Link>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white via-brand-50/40 to-white p-5 shadow-sm">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
        <div className="relative min-w-0 text-center">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-none">
            {WEBSITE_DELIVERY_FORM.name}
          </h1>
          <p className="mt-2 text-[12px] text-slate-600">{WEBSITE_DELIVERY_FORM.description}</p>
        </div>
      </div>

      {/* All fields in one section, in spec order. Conditional fields appear/
          disappear as their target field changes. */}
      <section className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
        <div className="p-5 grid gap-4 sm:grid-cols-2">
          {visible.map(f => (
            <FieldControl
              key={f.name}
              field={f}
              value={values[f.name] ?? ''}
              error={errors[f.name]}
              onChange={v => set(f.name, v)}
            />
          ))}
        </div>
      </section>

      <div className="flex justify-center gap-2 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-10 px-5 rounded-lg bg-gradient-to-br from-brand-600 to-brand-700 text-white text-[12.5px] font-semibold hover:from-brand-700 hover:to-brand-800 items-center shadow-md hover:shadow-lg transition-all disabled:opacity-60"
        >
          {submitting ? 'Submitting…' : 'Submit Delivery'}
        </button>
      </div>
    </form>
  );
}

function FieldControl({
  field,
  value,
  error,
  onChange,
}: {
  field: FormField;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const full = field.type === 'textarea';
  return (
    <label className={`block ${full ? 'sm:col-span-2' : ''}`}>
      <span className="lbl">
        {field.label}
        {field.required && <span className="text-rose-500 ml-0.5">*</span>}
        {field.encrypted && (
          <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-slate-400">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            encrypted
          </span>
        )}
      </span>

      {field.type === 'select' ? (
        <select className="fld" value={value} onChange={e => onChange(e.target.value)}>
          <option value="">Select…</option>
          {(field.options ?? []).map(o => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : field.type === 'textarea' ? (
        <textarea
          className="fld min-h-[90px] py-2"
          value={value}
          placeholder={field.placeholder}
          onChange={e => onChange(e.target.value)}
        />
      ) : field.type === 'date' ? (
        <input type="date" className="fld" value={value} onChange={e => onChange(e.target.value)} />
      ) : (
        <input
          type={field.type === 'url' ? 'url' : 'text'}
          className={`fld ${field.encrypted ? 'font-mono' : ''}`}
          value={value}
          placeholder={field.placeholder}
          onChange={e => onChange(e.target.value)}
        />
      )}

      {error && <span className="mt-1 block text-[11px] font-medium text-rose-600">{error}</span>}
    </label>
  );
}
