'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { PLATFORM_OPTIONS, STATUS_OPTIONS, SSL_OPTIONS, CATEGORY_OPTIONS, type Project } from '@/lib/types';
import { avatarStyle, initials } from '@/lib/ui';

const EMPTY: Project = { id: '' };

export default function ProjectPage() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get('id') || '';
  const { get, upsert, remove, ready } = useStore();
  const [form, setForm] = useState<Project>(EMPTY);

  useEffect(() => {
    if (!ready) return;
    if (id) {
      const existing = get(id);
      if (existing) setForm(existing);
    }
  }, [id, ready, get]);

  const update = <K extends keyof Project>(k: K, v: Project[K]) => setForm(f => ({ ...f, [k]: v }));

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    const saved = upsert({ ...form });
    router.push(`/project?id=${encodeURIComponent(saved.id)}`);
    alert('Saved');
  };

  const onDelete = () => {
    if (!form.id) return;
    if (!confirm(`Delete "${form.projectName}"?`)) return;
    remove(form.id);
    router.push('/projects');
  };

  const displayName = form.projectName || (id ? 'Untitled project' : 'New project');

  return (
    <form onSubmit={onSave} className="space-y-5 max-w-5xl">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white via-brand-50/40 to-white p-5 shadow-sm">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="h-12 w-12 shrink-0 rounded-xl flex items-center justify-center text-white font-bold text-[15px] ring-2 ring-white shadow-md"
              style={{ background: avatarStyle(displayName) }}
            >
              {initials(displayName)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-none truncate">
                  {id ? 'Edit Project' : 'New Project'}
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 backdrop-blur border border-slate-200 px-2.5 py-1 text-[10.5px] font-medium text-slate-700 shadow-sm">
                  <span className={`h-1.5 w-1.5 rounded-full ${form.id ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  {form.id ? 'Saved locally' : 'Draft'}
                </span>
              </div>
              <p className="mt-2 text-[12px] text-slate-600 truncate">
                {form.id
                  ? <>Editing <span className="font-semibold text-slate-800">{displayName}</span></>
                  : 'Details are saved to your browser (localStorage).'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {form.id && (
              <button type="button" onClick={onDelete}
                className="inline-flex h-9 px-3.5 rounded-lg bg-white border border-rose-200 text-rose-600 text-[12px] font-semibold hover:bg-rose-50 items-center shadow-sm transition-colors">
                Delete
              </button>
            )}
            <button type="submit"
              className="inline-flex h-9 px-4 rounded-lg bg-gradient-to-br from-brand-600 to-brand-700 text-white text-[12px] font-semibold hover:from-brand-700 hover:to-brand-800 items-center shadow-md hover:shadow-lg transition-all">
              Save Project
            </button>
          </div>
        </div>
      </div>

      {/* Overview */}
      <Section title="Overview" subtitle="Name, ownership, and platform.">
        <Field label="Project Name" full><input className="fld" value={form.projectName || ''} onChange={e => update('projectName', e.target.value)} required /></Field>
        <Field label="Project Manager"><input className="fld" value={form.projectManager || ''} onChange={e => update('projectManager', e.target.value)} /></Field>
        <Field label="Developer"><input className="fld" value={form.developer || ''} onChange={e => update('developer', e.target.value)} /></Field>
        <Field label="Platform">
          <select className="fld" value={form.platform || ''} onChange={e => update('platform', e.target.value)}>
            <option value="">Select…</option>
            {PLATFORM_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Category">
          <select className="fld" value={form.projectCategory || ''} onChange={e => update('projectCategory', e.target.value)}>
            <option value="">Select…</option>
            {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className="fld" value={form.status || ''} onChange={e => update('status', e.target.value)}>
            <option value="">Select…</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </Section>

      {/* Timeline */}
      <Section title="Timeline" subtitle="Milestone dates from kickoff to launch.">
        <Field label="Start Date"><input type="date" className="fld" value={form.startDate || ''} onChange={e => update('startDate', e.target.value)} /></Field>
        <Field label="Live Date"><input type="date" className="fld" value={form.liveDate || ''} onChange={e => update('liveDate', e.target.value)} /></Field>
        <Field label="Figma Approval"><input type="date" className="fld" value={form.figmaApproval || ''} onChange={e => update('figmaApproval', e.target.value)} /></Field>
        <Field label="HTML Approval"><input type="date" className="fld" value={form.htmlApproval || ''} onChange={e => update('htmlApproval', e.target.value)} /></Field>
        <Field label="CMS Approval"><input type="date" className="fld" value={form.cmsApproval || ''} onChange={e => update('cmsApproval', e.target.value)} /></Field>
      </Section>

      {/* Domain & Client */}
      <Section title="Domain & Client" subtitle="Domain, SSL, and client contact details.">
        <Field label="Domain Name"><input className="fld" value={form.domainName || ''} onChange={e => update('domainName', e.target.value)} /></Field>
        <Field label="SSL Status">
          <select className="fld" value={form.sslStatus || ''} onChange={e => update('sslStatus', e.target.value)}>
            <option value="">Select…</option>
            {SSL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Client Email"><input type="email" className="fld" value={form.clientEmail || ''} onChange={e => update('clientEmail', e.target.value)} /></Field>
        <Field label="Client Phone"><input className="fld" value={form.clientPhone || ''} onChange={e => update('clientPhone', e.target.value)} /></Field>
      </Section>

      {/* Maintenance */}
      <Section title="Maintenance" subtitle="Contract windows and recurring commitments.">
        <Field label="Maintenance Start"><input type="date" className="fld" value={form.maintenanceStart || ''} onChange={e => update('maintenanceStart', e.target.value)} /></Field>
        <Field label="Maintenance End"><input type="date" className="fld" value={form.maintenanceEnd || ''} onChange={e => update('maintenanceEnd', e.target.value)} /></Field>
      </Section>

      {/* Notes */}
      <Section title="Notes" subtitle="Scope and current work-status details.">
        <Field label="Current Update" full><textarea className="fld min-h-[90px] py-2" value={form.currentUpdate || ''} onChange={e => update('currentUpdate', e.target.value)} /></Field>
        <Field label="Project Scope" full><textarea className="fld min-h-[90px] py-2" value={form.projectScope || ''} onChange={e => update('projectScope', e.target.value)} /></Field>
      </Section>

      {/* Sticky footer actions */}
      <div className="flex justify-end gap-2 pt-2">
        {form.id && (
          <button type="button" onClick={onDelete}
            className="inline-flex h-10 px-4 rounded-lg bg-white border border-rose-200 text-rose-600 text-[12.5px] font-semibold hover:bg-rose-50 items-center shadow-sm transition-colors">
            Delete
          </button>
        )}
        <button type="submit"
          className="inline-flex h-10 px-5 rounded-lg bg-gradient-to-br from-brand-600 to-brand-700 text-white text-[12.5px] font-semibold hover:from-brand-700 hover:to-brand-800 items-center shadow-md hover:shadow-lg transition-all">
          Save Project
        </button>
      </div>
    </form>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 bg-gradient-to-b from-slate-50/60 to-white">
        <div className="text-[13px] font-semibold text-slate-900 tracking-tight">{title}</div>
        {subtitle && <div className="text-[11px] text-slate-500 mt-0.5">{subtitle}</div>}
      </div>
      <div className="p-5 grid gap-4 sm:grid-cols-2">
        {children}
      </div>
    </section>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? 'sm:col-span-2' : ''}`}>
      <span className="lbl">{label}</span>
      {children}
    </label>
  );
}
