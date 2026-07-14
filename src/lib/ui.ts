const AVATAR_COLORS = [
  'linear-gradient(135deg,#6089ff,#2748e0)',
  'linear-gradient(135deg,#f472b6,#db2777)',
  'linear-gradient(135deg,#34d399,#059669)',
  'linear-gradient(135deg,#fbbf24,#d97706)',
  'linear-gradient(135deg,#a78bfa,#6d28d9)',
  'linear-gradient(135deg,#22d3ee,#0891b2)',
  'linear-gradient(135deg,#fb7185,#e11d48)',
  'linear-gradient(135deg,#4ade80,#16a34a)',
];

export function initials(name?: string) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export function avatarStyle(name?: string) {
  const idx = (name || '').split('').reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

export function statusPillClass(status?: string) {
  if (!status) return 'pill pill-notstarted';
  const s = status.toLowerCase();
  if (s.includes('progress')) return 'pill pill-progress';
  if (s.includes('live')) return 'pill pill-live';
  if (s.includes('hold')) return 'pill pill-hold';
  if (s.includes('review')) return 'pill pill-review';
  if (s.includes('design')) return 'pill pill-design';
  if (s.includes('development')) return 'pill pill-dev';
  if (s.includes('test')) return 'pill pill-test';
  if (s.includes('cancel')) return 'pill pill-cancel';
  return 'pill pill-notstarted';
}

export function fmtDate(iso?: string) {
  if (!iso) return '—';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtRelative(ts?: number) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
