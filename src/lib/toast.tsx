'use client';

import {
  createContext, useCallback, useContext, useEffect, useState, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

// Lightweight toast notifications, replacing native alert() for transient
// success / info feedback.
//
//   const toast = useToast();
//   toast.success('Saved');
//   toast('Custom message', { tone: 'info', duration: 4000 });

type ToastTone = 'success' | 'error' | 'info';

type ToastItem = {
  id: number;
  message: ReactNode;
  tone: ToastTone;
};

type ToastFn = ((message: ReactNode, opts?: { tone?: ToastTone; duration?: number }) => void) & {
  success: (message: ReactNode, duration?: number) => void;
  error: (message: ReactNode, duration?: number) => void;
  info: (message: ReactNode, duration?: number) => void;
};

const ToastContext = createContext<ToastFn | null>(null);

const DEFAULT_DURATION = 3000;
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems(prev => prev.filter(t => t.id !== id));
  }, []);

  const push = useCallback((message: ReactNode, opts?: { tone?: ToastTone; duration?: number }) => {
    const id = nextId++;
    const tone = opts?.tone ?? 'info';
    setItems(prev => [...prev, { id, message, tone }]);
    const duration = opts?.duration ?? DEFAULT_DURATION;
    if (duration > 0) window.setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  const toast = push as ToastFn;
  toast.success = (m, d) => push(m, { tone: 'success', duration: d });
  toast.error = (m, d) => push(m, { tone: 'error', duration: d });
  toast.info = (m, d) => push(m, { tone: 'info', duration: d });

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const TONES: Record<ToastTone, { ring: string; iconBg: string; iconText: string; icon: ReactNode }> = {
  success: {
    ring: 'ring-emerald-500/20',
    iconBg: 'bg-emerald-50',
    iconText: 'text-emerald-600',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
  error: {
    ring: 'ring-rose-500/20',
    iconBg: 'bg-rose-50',
    iconText: 'text-rose-600',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    ),
  },
  info: {
    ring: 'ring-brand-500/20',
    iconBg: 'bg-brand-50',
    iconText: 'text-brand-600',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
};

function ToastViewport({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: number) => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !items.length) return null;

  return createPortal(
    <div
      className="fixed bottom-4 right-4 z-[1200] flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm pointer-events-none"
      role="region"
      aria-label="Notifications"
    >
      {items.map(item => {
        const t = TONES[item.tone];
        return (
          <div
            key={item.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 rounded-xl bg-white px-3.5 py-3 shadow-lg ring-1 ${t.ring} border border-slate-200/70 animate-[toastIn_220ms_cubic-bezier(0.16,1,0.3,1)]`}
          >
            <div className={`mt-px h-6 w-6 shrink-0 rounded-full ${t.iconBg} ${t.iconText} grid place-items-center`}>
              {t.icon}
            </div>
            <div className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-slate-800 pt-0.5">
              {item.message}
            </div>
            <button
              onClick={() => onDismiss(item.id)}
              aria-label="Dismiss"
              className="shrink-0 -mr-1 -mt-0.5 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
}
