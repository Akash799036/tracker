'use client';
import React from 'react';

export const PALETTE = [
  '#2748e0','#059669','#d97706','#e11d48','#7c3aed','#0891b2',
  '#ca8a04','#0d9488','#db2777','#4f46e5','#ea580c','#64748b',
];

type DonutItem = { label: string; value: number; color?: string };

export function Donut({ data, centerLabel = 'Total', emptyMsg = 'No data yet', hideLabels = false, hideLegend = false }: {
  data: DonutItem[]; centerLabel?: string; emptyMsg?: string; hideLabels?: boolean; hideLegend?: boolean;
}) {
  const items = data.filter(d => d.value > 0);
  const total = items.reduce((s, d) => s + d.value, 0);
  if (!total) return <div className="chart-empty">{emptyMsg}</div>;

  const R = 40, cx = 50, cy = 50, sw = 14;
  let angle = -Math.PI / 2;

  const slices = items.length === 1
    ? [<circle key="one" cx={cx} cy={cy} r={R} fill="none" stroke={items[0].color || PALETTE[0]} strokeWidth={sw} />]
    : items.map((d, i) => {
        const sliceAngle = (d.value / total) * 2 * Math.PI;
        const end = angle + sliceAngle;
        const sx = cx + R * Math.cos(angle), sy = cy + R * Math.sin(angle);
        const ex = cx + R * Math.cos(end), ey = cy + R * Math.sin(end);
        const large = sliceAngle > Math.PI ? 1 : 0;
        const color = d.color || PALETTE[i % PALETTE.length];
        const path = `M ${sx.toFixed(4)} ${sy.toFixed(4)} A ${R} ${R} 0 ${large} 1 ${ex.toFixed(4)} ${ey.toFixed(4)}`;
        angle = end;
        return <path key={i} d={path} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="butt" />;
      });

  return (
    <div className="donut-wrap">
      <div className="donut-graphic">
        <svg viewBox="0 0 100 100" className="donut-svg">
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="#f1f5f9" strokeWidth={sw} />
          {slices}
        </svg>
        <div className="donut-center">
          <div className="donut-total">{total}</div>
          <div className="donut-sublabel">{centerLabel}</div>
        </div>
      </div>
      {!hideLegend && (
        <div className="donut-legend">
          {items.map((d, i) => {
            const color = d.color || PALETTE[i % PALETTE.length];
            const pct = Math.round((d.value / total) * 100);
            return (
              <div key={i} className="legend-item">
                <span className="legend-dot" style={{ background: color }} />
                {!hideLabels && <span className="legend-label">{d.label}</span>}
                <span className="legend-value">{d.value} · {pct}%</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Pie({ data, emptyMsg = 'No data yet', hideLabels = false }: {
  data: DonutItem[]; emptyMsg?: string; hideLabels?: boolean;
}) {
  const items = data.filter(d => d.value > 0);
  const total = items.reduce((s, d) => s + d.value, 0);
  if (!total) return <div className="chart-empty">{emptyMsg}</div>;

  const R = 45, cx = 50, cy = 50;
  let angle = -Math.PI / 2;

  const slices = items.length === 1
    ? [<circle key="one" cx={cx} cy={cy} r={R} fill={items[0].color || PALETTE[0]} />]
    : items.map((d, i) => {
        const sliceAngle = (d.value / total) * 2 * Math.PI;
        const end = angle + sliceAngle;
        const sx = cx + R * Math.cos(angle), sy = cy + R * Math.sin(angle);
        const ex = cx + R * Math.cos(end), ey = cy + R * Math.sin(end);
        const large = sliceAngle > Math.PI ? 1 : 0;
        const color = d.color || PALETTE[i % PALETTE.length];
        const path = `M ${cx} ${cy} L ${sx.toFixed(4)} ${sy.toFixed(4)} A ${R} ${R} 0 ${large} 1 ${ex.toFixed(4)} ${ey.toFixed(4)} Z`;
        angle = end;
        return <path key={i} d={path} fill={color} stroke="#fff" strokeWidth={0.6} />;
      });

  return (
    <div className="donut-wrap">
      <div className="donut-graphic">
        <svg viewBox="0 0 100 100" className="donut-svg">{slices}</svg>
      </div>
      <div className="donut-legend">
        {items.map((d, i) => {
          const color = d.color || PALETTE[i % PALETTE.length];
          const pct = Math.round((d.value / total) * 100);
          return (
            <div key={i} className="legend-item">
              <span className="legend-dot" style={{ background: color }} />
              {!hideLabels && <span className="legend-label">{d.label}</span>}
              <span className="legend-value">{d.value} · {pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type Seg = { value: number; color?: string; label?: string };
type VBarItem = { key?: string; label: string; sub?: string; value: number; segments?: Seg[] };

export function VBars({ data, height = 260, emptyMsg = 'No data', onBarClick }: {
  data: VBarItem[]; height?: number; emptyMsg?: string; onBarClick?: (key: string) => void;
}) {
  if (!data.length) return <div className="chart-empty">{emptyMsg}</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  const W = 720, H = 260, padL = 36, padR = 14, padT = 30, padB = 34;
  const chartW = W - padL - padR, chartH = H - padT - padB;
  const step = chartW / data.length;
  const barW = Math.min(38, Math.max(6, step * 0.58));
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const gradId = React.useId().replace(/:/g, '');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6089ff" />
          <stop offset="1" stopColor="#2748e0" />
        </linearGradient>
      </defs>
      {ticks.map((pct, i) => {
        const y = padT + chartH * (1 - pct);
        const val = Math.round(max * pct);
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#f1f5f9" />
            <text x={padL - 8} y={y + 3} textAnchor="end" fontSize={10} fill="#94a3b8">{val}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const barH = (d.value / max) * chartH;
        const x = padL + i * step + (step - barW) / 2;
        const y = padT + chartH - barH;
        const key = d.key ?? d.label;
        const inside = barH >= 24;
        const clickable = !!onBarClick;
        const xLabel = d.sub ? `${d.label} ${d.sub}` : d.label;
        const segs = d.segments?.filter(s => s.value > 0);
        let body: React.ReactNode;
        if (segs && segs.length) {
          const clip = `clip-${gradId}-${i}`;
          let cursor = padT + chartH;
          body = (
            <>
              <defs>
                <clipPath id={clip}>
                  <rect x={x} y={y} width={barW} height={Math.max(barH, 0)} rx={3} ry={3} />
                </clipPath>
              </defs>
              <g clipPath={`url(#${clip})`}>
                {segs.map((s, si) => {
                  const h = (s.value / d.value) * barH;
                  cursor -= h;
                  return <rect key={si} x={x} y={cursor} width={barW} height={h} fill={s.color || '#2748e0'} />;
                })}
              </g>
            </>
          );
        } else {
          body = <rect x={x} y={y} width={barW} height={Math.max(barH, 0)} rx={3} ry={3} fill={`url(#${gradId})`} />;
        }
        return (
          <g key={i} style={{ cursor: clickable ? 'pointer' : 'default' }}
             onClick={clickable ? () => onBarClick!(key) : undefined}>
            {body}
            {d.value > 0 && (
              <text x={x + barW / 2} y={inside ? y + 13 : y - 5} textAnchor="middle"
                fontSize={10} fill={inside ? '#fff' : '#334155'} fontWeight={700}>{d.value}</text>
            )}
            <text x={x + barW / 2} y={H - padB + 18} textAnchor="middle" fontSize={10} fill="#64748b">{xLabel}</text>
            <rect x={padL + i * step} y={padT} width={step} height={chartH} fill="transparent">
              <title>{`${d.label}${d.sub ? ' ' + d.sub : ''}: ${d.value}`}</title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}

type HBarItem = { key?: string; label: string; value: number; color?: string; sub?: string };

export function HBars({ data, emptyMsg = 'No data', onBarClick }: {
  data: HBarItem[]; emptyMsg?: string; onBarClick?: (key: string) => void;
}) {
  if (!data.length) return <div className="chart-empty">{emptyMsg}</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="hbar-list">
      {data.map((d, i) => {
        const pct = (d.value / max) * 100;
        const color = d.color || PALETTE[i % PALETTE.length];
        const key = d.key ?? d.label;
        const Tag: any = onBarClick ? 'button' : 'div';
        return (
          <Tag key={i} className={`hbar-row ${onBarClick ? 'hbar-clickable' : ''}`}
               onClick={onBarClick ? () => onBarClick(key) : undefined}>
            <div className="hbar-header">
              <span className="hbar-label">{d.label}</span>
              <span className="hbar-value">{d.value}{d.sub ? <span className="text-slate-400 font-normal"> · {d.sub}</span> : null}</span>
            </div>
            <div className="hbar-track">
              <div className="hbar-fill" style={{ width: `${pct.toFixed(1)}%`, background: color }} />
            </div>
          </Tag>
        );
      })}
    </div>
  );
}
