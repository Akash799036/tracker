'use client';

import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

// Imperative confirm dialog, replacing the native window.confirm().
//
//   const confirm = useConfirm();
//   if (!(await confirm({ title: 'Delete row?', message: '…', tone: 'danger' }))) return;
//
// Built on the same portal + backdrop + focus-trap vocabulary as Modal.tsx, so
// it feels like the rest of the app rather than a browser popup. Resolving the
// promise (Cancel, Escape, backdrop, or Confirm) closes the dialog.

export type ConfirmTone = 'danger' | 'brand';

export type ConfirmOptions = {
  title: string;
  message?: ReactNode;
  /** Label for the affirmative button. Defaults per tone (Delete / Confirm). */
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>(resolve => {
        setPending({ ...opts, resolve });
      }),
    []
  );

  const settle = useCallback((ok: boolean) => {
    setPending(prev => {
      prev?.resolve(ok);
      return null;
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && <ConfirmDialog {...pending} onSettle={settle} />}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const TONES: Record<ConfirmTone, {
  iconBg: string; iconText: string; icon: ReactNode; confirmBtn: string; defaultLabel: string;
}> = {
  danger: {
    iconBg: 'bg-rose-50',
    iconText: 'text-rose-600',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    confirmBtn: 'bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-300 text-white',
    defaultLabel: 'Delete',
  },
  brand: {
    iconBg: 'bg-brand-50',
    iconText: 'text-brand-600',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
    confirmBtn: 'bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-300 text-white',
    defaultLabel: 'Confirm',
  },
};

function ConfirmDialog({
  title, message, confirmLabel, cancelLabel = 'Cancel', tone = 'brand', onSettle,
}: ConfirmOptions & { onSettle: (ok: boolean) => void }) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const t = TONES[tone];

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const opener = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onSettle(false); return; }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [onSettle]);

  // Default focus to the affirmative action so Enter confirms.
  useEffect(() => {
    if (mounted) confirmRef.current?.focus();
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[1100] flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] animate-[confirmFade_150ms_ease-out]" onClick={() => onSettle(false)} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl outline-none animate-[confirmPop_180ms_cubic-bezier(0.16,1,0.3,1)]"
      >
        <div className="p-5">
          <div className="flex gap-4">
            <div className={`h-11 w-11 shrink-0 rounded-full ${t.iconBg} ${t.iconText} grid place-items-center`}>
              {t.icon}
            </div>
            <div className="min-w-0 pt-0.5">
              <h3 className="text-[15px] font-semibold text-slate-900 leading-snug">{title}</h3>
              {message != null && (
                <div className="mt-1.5 text-[13px] leading-relaxed text-slate-600">{message}</div>
              )}
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2.5">
            <button
              onClick={() => onSettle(false)}
              className="h-9 px-4 rounded-lg border border-slate-200 bg-white text-[13px] font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmRef}
              onClick={() => onSettle(true)}
              className={`h-9 px-4 rounded-lg text-[13px] font-semibold shadow-sm focus:outline-none focus-visible:ring-2 transition-colors ${t.confirmBtn}`}
            >
              {confirmLabel ?? t.defaultLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
