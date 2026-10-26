"use client";

/**
 * Small building blocks for Publish's Dashboard, Summary and Extension pages
 * (v0.6.0). No charting library: bars are plain CSS / hand-drawn SVG, to stay
 * inside the Cloudflare edge bundle budget.
 */

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export type Section<T> = { ok: true; data: T } | { ok: false; error: string };

export function Card({ title, subtitle, right, children, className = "" }: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-white rounded-xl border border-gray-200 p-4 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/** A section that could not be read. Never shown as zero. */
export function Unavailable({ error }: { error?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
      <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
      <span>Unavailable right now{error ? ` — ${error}` : ""}. Numbers are not shown rather than shown as zero.</span>
    </div>
  );
}

export function SectionBody<T>({ s, children }: { s: Section<T> | undefined; children: (d: T) => React.ReactNode }) {
  if (!s) return <div className="text-xs text-gray-400">Loading…</div>;
  if (!s.ok) return <Unavailable error={s.error} />;
  return <>{children(s.data)}</>;
}

export function NetBadge({ p }: { p: string }) {
  return p === "LINKEDIN" ? (
    <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#0A66C2] text-white">in</span>
  ) : p === "TWITTER" ? (
    <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black text-white">𝕏</span>
  ) : (
    <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">{p}</span>
  );
}

export function Dot({ tone }: { tone: "ok" | "warn" | "bad" | "off" }) {
  const c = tone === "ok" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-400" : tone === "bad" ? "bg-red-600" : "bg-gray-300";
  return <span className={`inline-block w-2 h-2 rounded-full ${c}`} />;
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 0) return "in the future";
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}

/** "Tue Oct 27, 9:30 AM" in a time zone. */
export function fmtIn(iso: string | null | undefined, tz: string, withDay = true): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: tz,
      ...(withDay ? { weekday: "short", month: "short", day: "numeric" } : {}),
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export function tzAbbr(iso: string, tz: string): string {
  try {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date(iso));
    return p.find((x) => x.type === "timeZoneName")?.value || tz;
  } catch {
    return tz;
  }
}

export function withClient(href: string, clientId: string | null | undefined): string {
  return clientId ? `${href}${href.includes("?") ? "&" : "?"}client=${clientId}` : href;
}

/** A horizontal stacked bar, CSS only. */
export function StackBar({ parts, total, height = 8 }: { parts: { value: number; className: string; title: string }[]; total?: number; height?: number }) {
  const sum = total ?? parts.reduce((a, p) => a + p.value, 0);
  if (!sum) return <div className="w-full rounded bg-gray-100" style={{ height }} />;
  return (
    <div className="w-full flex rounded overflow-hidden bg-gray-100" style={{ height }}>
      {parts.map((p, i) =>
        p.value > 0 ? <div key={i} className={p.className} style={{ width: `${(p.value / sum) * 100}%` }} title={`${p.title}: ${p.value}`} /> : null,
      )}
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-xs font-medium text-red-700 hover:underline whitespace-nowrap">
      {children}
    </Link>
  );
}
