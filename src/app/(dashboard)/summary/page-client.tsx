"use client";

/**
 * /summary — Publish's own Summary (v0.6.0): one row per CAMPAIGN / INTERNAL
 * company for the selected month. Drafted and Approved count content items;
 * Scheduled, Published and Failed count network deliveries (one per LinkedIn
 * page / X account). "In review" is the queue right now.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { Header } from "@/components/layout/header";
import { useSelectedClient } from "@/lib/selected-client";
import { Dot, NetBadge, ago, fmtIn, withClient } from "@/components/publish/ui";
import type { SummaryRow } from "@/lib/publish-dashboard";

type Data = { month: string; monthLabel: string; generatedAt: string; runwayAvailable: boolean; rows: SummaryRow[] };

function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function thisMonth(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }).slice(0, 7);
}

const COLS: { key: keyof SummaryRow; label: string; hint: string }[] = [
  { key: "drafted", label: "Drafted", hint: "Content items created this month" },
  { key: "inReview", label: "In review", hint: "Waiting for approval or a rewrite, right now" },
  { key: "approved", label: "Approved", hint: "Content items approved this month" },
  { key: "scheduled", label: "Scheduled", hint: "Deliveries still to go out this month" },
  { key: "published", label: "Published", hint: "Deliveries published this month" },
  { key: "failed", label: "Failed", hint: "Deliveries failed or missed this month" },
];

export function SummaryClient() {
  const { clientId } = useSelectedClient();
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ month });
      if (clientId) qs.set("client", clientId);
      const r = await fetch(`/api/publishing/summary?${qs}`, { cache: "no-store" });
      const j = await r.json();
      if (j?.success) { setData(j.data); setErr(null); } else setErr(j?.error || "Could not load the summary.");
    } catch {
      setErr("Could not load the summary.");
    } finally {
      setLoading(false);
    }
  }, [month, clientId]);
  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const c of COLS) t[c.key] = (data?.rows || []).reduce((a, r) => a + (r[c.key] as number), 0);
    return t;
  }, [data]);
  const isCurrent = month === thisMonth();

  return (
    <div>
      <Header
        title="Summary"
        eyebrow="Publish"
        subtitle="Every campaign and internal company for the month: what was drafted, approved, scheduled and published — and how long the approved content lasts."
        actions={
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-lg border border-gray-300 bg-white">
              <button aria-label="Previous month" onClick={() => setMonth((m) => shiftMonth(m, -1))} className="px-2 py-1.5 hover:bg-gray-50"><ChevronLeft size={15} /></button>
              <span className="px-2 text-sm font-medium text-gray-800 min-w-[120px] text-center">{data?.month === month ? data.monthLabel : month}</span>
              <button aria-label="Next month" onClick={() => setMonth((m) => shiftMonth(m, 1))} className="px-2 py-1.5 hover:bg-gray-50"><ChevronRight size={15} /></button>
            </div>
            {!isCurrent && <button onClick={() => setMonth(thisMonth())} className="px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">This month</button>}
            <button onClick={() => void load()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
            </button>
          </div>
        }
      />
      {err && <div className="text-sm rounded-lg px-3 py-2 mb-4 bg-red-50 text-red-800">{err}</div>}
      {!data ? (
        !err && <div className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</div>
      ) : data.rows.length === 0 ? (
        <p className="text-sm text-gray-600">{clientId ? "This client is not a campaign or internal company." : "No campaign or internal companies yet."}</p>
      ) : (
        <section className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200 bg-gray-50/60">
                <th className="py-2 px-3 font-medium">Company</th>
                {COLS.map((c) => <th key={c.key} title={c.hint} className="py-2 px-2 font-medium text-right">{c.label}</th>)}
                <th className="py-2 px-2 font-medium">Next scheduled</th>
                <th className="py-2 px-2 font-medium">Runway</th>
                <th className="py-2 px-2 font-medium">Last published</th>
                <th className="py-2 px-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.clientId} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="py-2 px-3">
                    <div className="font-medium text-gray-900">{r.company}</div>
                    <div className="text-[11px] text-gray-400">{r.clientType === "INTERNAL" ? "Internal" : "Campaign"}</div>
                  </td>
                  {COLS.map((c) => {
                    const v = r[c.key] as number;
                    return (
                      <td key={c.key} className={`py-2 px-2 text-right tabular-nums ${v === 0 ? "text-gray-300" : c.key === "failed" ? "text-red-700 font-semibold" : "text-gray-800"}`}>{v}</td>
                    );
                  })}
                  <td className="py-2 px-2 whitespace-nowrap text-xs">
                    {r.nextScheduledAt ? <span className="inline-flex items-center gap-1">{r.nextScheduledPlatform && <NetBadge p={r.nextScheduledPlatform} />}{fmtIn(r.nextScheduledAt, r.timezone)}</span> : <span className="text-red-700">nothing scheduled</span>}
                  </td>
                  <td className="py-2 px-2 whitespace-nowrap text-xs">
                    {r.runwayDays == null ? (
                      <span className="text-gray-400">unavailable</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <Dot tone={r.runwayLevel === "ok" ? "ok" : r.runwayLevel === "low" ? "warn" : "bad"} />
                        {r.runwayToHorizon ? "to end of next month" : `${r.runwayDays} day${r.runwayDays === 1 ? "" : "s"}`}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 whitespace-nowrap text-xs text-gray-600">{r.lastPublishedAt ? ago(r.lastPublishedAt) : "never"}</td>
                  <td className="py-2 px-3 whitespace-nowrap text-xs">
                    <Link href={withClient("/publishing", r.clientId)} className="font-medium text-red-700 hover:underline">Content</Link>
                    <span className="text-gray-300"> · </span>
                    <Link href={withClient("/publishing/calendar", r.clientId)} className="font-medium text-red-700 hover:underline">Calendar</Link>
                  </td>
                </tr>
              ))}
            </tbody>
            {data.rows.length > 1 && (
              <tfoot>
                <tr className="bg-gray-50/60 font-semibold">
                  <td className="py-2 px-3 text-gray-700">Total · {data.rows.length} companies</td>
                  {COLS.map((c) => <td key={c.key} className="py-2 px-2 text-right tabular-nums">{totals[c.key]}</td>)}
                  <td colSpan={4} />
                </tr>
              </tfoot>
            )}
          </table>
        </section>
      )}
      {data && (
        <p className="mt-3 text-[11px] text-gray-400">
          Drafted and Approved count content items; Scheduled, Published and Failed count deliveries (one per LinkedIn page / X account). In review is the queue right now. Runway is as of today.
          {!data.runwayAvailable && " Runway could not be computed just now."} Updated {ago(data.generatedAt)}.
        </p>
      )}
    </div>
  );
}
