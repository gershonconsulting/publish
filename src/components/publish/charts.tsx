"use client";

/**
 * Publish charts (v0.9.0) — hand-drawn SVG, no charting library (keeps the
 * Cloudflare edge bundle small). Every chart has a text title for screen
 * readers and a tooltip on each mark.
 */

import Link from "next/link";

export const C = {
  brand: "#CC3333",
  ok: "#16A34A",
  okSoft: "#86EFAC",
  warn: "#F59E0B",
  bad: "#DC2626",
  badSoft: "#FECACA",
  off: "#D1D5DB",
  ink: "#111827",
  mute: "#6B7280",
  grid: "#E5E7EB",
  linkedin: "#0A66C2",
  x: "#111827",
  blue: "#3B82F6",
  violet: "#8B5CF6",
};
export const TONE_COLOR = { ok: C.ok, warn: C.warn, bad: C.bad, off: C.off } as const;

/* ── Score ring ─────────────────────────────────────────────────────────── */

export function ScoreRing({ value, tone, size = 132, label = "score" }: { value: number | null; tone: keyof typeof TONE_COLOR; size?: number; label?: string }) {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${value ?? "not available"} out of 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.grid} strokeWidth={12} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TONE_COLOR[tone]} strokeWidth={12} strokeLinecap="round"
        strokeDasharray={`${(v / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.27} fontWeight={700} fill={C.ink}>{value ?? "—"}</text>
      <text x="50%" y="68%" textAnchor="middle" fontSize={11} fill={C.mute}>out of 100</text>
    </svg>
  );
}

/* ── Mini meter (KPI cards) ─────────────────────────────────────────────── */

export function Meter({ value, tone }: { value: number | null; tone: keyof typeof TONE_COLOR }) {
  return (
    <div className="h-2 rounded-full bg-gray-100 overflow-hidden" title={value == null ? "Not measurable" : `${value}%`}>
      <div className="h-full rounded-full" style={{ width: `${value ?? 0}%`, background: TONE_COLOR[tone] }} />
    </div>
  );
}

/* ── Donut ──────────────────────────────────────────────────────────────── */

export function Donut({ parts, center, sub, size = 150 }: { parts: { label: string; value: number; color: string }[]; center: string; sub?: string; size?: number }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${center} ${sub || ""}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.grid} strokeWidth={18} />
      {total > 0 &&
        parts.filter((p) => p.value > 0).map((p) => {
          const len = (p.value / total) * c;
          const el = (
            <circle key={p.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={18}
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-acc} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              <title>{`${p.label}: ${p.value}`}</title>
            </circle>
          );
          acc += len;
          return el;
        })}
      <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" fontSize={24} fontWeight={700} fill={C.ink}>{center}</text>
      {sub && <text x="50%" y="64%" textAnchor="middle" fontSize={10.5} fill={C.mute}>{sub}</text>}
    </svg>
  );
}

export function Legend({ items }: { items: { label: string; color: string; value?: number | string }[] }) {
  return (
    <ul className="space-y-1">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2 text-xs text-gray-700">
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: i.color }} />
          <span className="flex-1">{i.label}</span>
          {i.value !== undefined && <b className="font-semibold text-gray-900 tabular-nums">{i.value}</b>}
        </li>
      ))}
    </ul>
  );
}

/* ── Horizontal coverage bars (one row per company) ────────────────────── */

export type HBarRow = { id: string; label: string; ratio: number | null; detail: string; href?: string; tone: keyof typeof TONE_COLOR; extra?: React.ReactNode };

export function CoverageBars({ rows }: { rows: HBarRow[] }) {
  return (
    <div className="space-y-2.5">
      {rows.map((r) => {
        const pct = r.ratio == null ? 0 : Math.round(r.ratio * 100);
        const name = r.href ? <Link href={r.href} className="hover:underline">{r.label}</Link> : r.label;
        return (
          <div key={r.id} className="grid grid-cols-[minmax(110px,180px)_1fr_auto] items-center gap-3">
            <div className="text-sm text-gray-900 truncate font-medium">{name}</div>
            <div className="relative h-5 rounded bg-gray-100" title={r.detail}>
              <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${pct}%`, background: TONE_COLOR[r.tone] }} />
              <div className="absolute inset-y-0 border-l border-dashed border-gray-400" style={{ left: "50%" }} />
              <span className="absolute inset-y-0 right-1.5 flex items-center text-[11px] font-semibold text-gray-700 tabular-nums">{r.ratio == null ? "—" : `${pct}%`}</span>
            </div>
            <div className="text-xs text-gray-500 whitespace-nowrap">{r.extra ?? r.detail}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Stacked columns (next 7 days, aging) ───────────────────────────────── */

export function Columns({ cols, height = 150, ariaLabel }: { cols: { label: string; sub?: string; segs: { value: number; color: string; title: string }[] }[]; height?: number; ariaLabel: string }) {
  const W = 640, padB = 30, padT = 16;
  const max = Math.max(1, ...cols.map((c) => c.segs.reduce((a, s) => a + s.value, 0)));
  const step = W / Math.max(1, cols.length);
  const bw = Math.min(56, step * 0.6);
  const H = height;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={ariaLabel}>
      {[0.5, 1].map((g) => (
        <line key={g} x1={0} x2={W} y1={padT + (H - padT - padB) * (1 - g)} y2={padT + (H - padT - padB) * (1 - g)} stroke={C.grid} strokeDasharray="3 3" />
      ))}
      <line x1={0} x2={W} y1={H - padB} y2={H - padB} stroke={C.grid} />
      {cols.map((c, i) => {
        const x = i * step + (step - bw) / 2;
        let y = H - padB;
        const total = c.segs.reduce((a, s) => a + s.value, 0);
        return (
          <g key={c.label + i}>
            {c.segs.map((s) => {
              const h = (s.value / max) * (H - padT - padB);
              y -= h;
              return s.value > 0 ? <rect key={s.title} x={x} y={y} width={bw} height={h} fill={s.color} rx={2}><title>{`${c.label}: ${s.value} ${s.title}`}</title></rect> : null;
            })}
            <text x={x + bw / 2} y={y - 4} textAnchor="middle" fontSize={11} fontWeight={600} fill={total ? C.ink : C.mute}>{total}</text>
            <text x={x + bw / 2} y={H - padB + 13} textAnchor="middle" fontSize={10.5} fill={C.mute}>{c.label}</text>
            {c.sub && <text x={x + bw / 2} y={H - padB + 25} textAnchor="middle" fontSize={9.5} fill="#9CA3AF">{c.sub}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/* ── Lines (14-day trend) ───────────────────────────────────────────────── */

export function Lines({ labels, series, height = 150, ariaLabel }: { labels: string[]; series: { key: string; label: string; color: string; values: number[] }[]; height?: number; ariaLabel: string }) {
  const W = 640, padB = 22, padT = 12, padL = 26;
  const H = height;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const n = Math.max(1, labels.length - 1);
  const X = (i: number) => padL + (i / n) * (W - padL - 8);
  const Y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={ariaLabel}>
      {[0, 0.5, 1].map((g) => (
        <g key={g}>
          <line x1={padL} x2={W} y1={Y(max * g)} y2={Y(max * g)} stroke={C.grid} strokeDasharray={g ? "3 3" : undefined} />
          <text x={padL - 5} y={Y(max * g) + 3} textAnchor="end" fontSize={9.5} fill={C.mute}>{Math.round(max * g)}</text>
        </g>
      ))}
      {series.map((s) => (
        <g key={s.key}>
          <polyline fill="none" stroke={s.color} strokeWidth={2.2} strokeLinejoin="round" points={s.values.map((v, i) => `${X(i)},${Y(v)}`).join(" ")} />
          {s.values.map((v, i) => (
            <circle key={i} cx={X(i)} cy={Y(v)} r={2.6} fill={s.color}><title>{`${labels[i]}: ${v} ${s.label.toLowerCase()}`}</title></circle>
          ))}
        </g>
      ))}
      {labels.map((l, i) => (i % 2 === (labels.length - 1) % 2 ? <text key={l + i} x={X(i)} y={H - 6} textAnchor="middle" fontSize={9.5} fill={C.mute}>{l}</text> : null))}
    </svg>
  );
}

/* ── Funnel (content pipeline) ──────────────────────────────────────────── */

export function Funnel({ steps }: { steps: { label: string; value: number; color: string; hint: string }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className="space-y-2">
      {steps.map((s) => (
        <div key={s.label} className="grid grid-cols-[120px_1fr_44px] items-center gap-3" title={s.hint}>
          <div className="text-xs text-gray-600">{s.label}</div>
          <div className="h-6 rounded bg-gray-50 flex items-center">
            <div className="h-6 rounded" style={{ width: `${Math.max(2, (s.value / max) * 100)}%`, background: s.color }} />
          </div>
          <div className="text-sm font-semibold text-gray-900 text-right tabular-nums">{s.value}</div>
        </div>
      ))}
    </div>
  );
}
