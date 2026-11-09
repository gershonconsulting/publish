"use client";

/**
 * /publishing/funnel — Content funnel (v0.12.0).
 *
 * The three views Olivier liked on Social's old "By Cloud Campaign" and
 * "By HeroPost" pages, now LIVE from Publish's own content:
 *   1. Output vs target — each company × last / this / next month,
 *      Created → Validated → Scheduled → Published against its cadence.
 *   2. By company — last month vs this month, side by side.
 *   3. All months — 12-month funnel, validation lag, who approved.
 * Frames follow the shared Green / Orange / Red rule (lib/frame-tone.ts).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw } from "lucide-react";
import { Header } from "@/components/layout/header";
import { useSelectedClient } from "@/lib/selected-client";
import { withClient } from "@/components/publish/ui";
import { frameTone, FRAME_STYLE, pctLabel } from "@/lib/frame-tone";
import type { CompanyFunnel, Funnel, FunnelData, MonthTarget } from "@/lib/publish-funnel";

const COL = { created: "#6366f1", validated: "#0ea5e9", scheduled: "#f59e0b", published: "#10b981" } as const;
const STAGES: { k: keyof Funnel; label: string }[] = [
  { k: "created", label: "Created" },
  { k: "validated", label: "Validated" },
  { k: "scheduled", label: "Scheduled" },
  { k: "published", label: "Published" },
];

function fmtMonth(ym: string, long = false): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: long ? "long" : "short", year: "numeric", timeZone: "UTC" });
}

type Tab = "target" | "clients" | "months";

export function FunnelClient() {
  const { clientId } = useSelectedClient();
  const [tab, setTab] = useState<Tab>("target");
  const [data, setData] = useState<FunnelData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = clientId ? `?client=${encodeURIComponent(clientId)}` : "";
      const r = await fetch(`/api/publishing/funnel${qs}`, { cache: "no-store" });
      const j = await r.json();
      if (j?.success) { setData(j.data); setErr(null); } else setErr(j?.error || "Could not load the content funnel.");
    } catch {
      setErr("Could not load the content funnel.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <Header
        title="Content funnel"
        eyebrow="Publish"
        subtitle="Created → validated → scheduled → published, per company, against each company's posting objective. Live from Publish."
        actions={
          <button onClick={() => void load()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
          </button>
        }
      />

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <TabBtn on={tab === "target"} onClick={() => setTab("target")}>Output vs target</TabBtn>
        <TabBtn on={tab === "clients"} onClick={() => setTab("clients")}>By company · last vs this month</TabBtn>
        <TabBtn on={tab === "months"} onClick={() => setTab("months")}>All months · funnel</TabBtn>
      </div>

      {err && <div className="text-sm rounded-lg px-3 py-2 mb-4 bg-red-50 text-red-800">{err}</div>}
      {!data ? (
        !err && <div className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</div>
      ) : data.companies.length === 0 ? (
        <p className="text-sm text-gray-600">{clientId ? "This client is not a campaign or internal company." : "No campaign or internal companies yet."}</p>
      ) : tab === "target" ? (
        <TargetTab d={data} />
      ) : tab === "clients" ? (
        <ClientsTab d={data} />
      ) : (
        <MonthsTab d={data} />
      )}

      <p className="text-xs text-gray-400 mt-8">
        Months are in New York time. <b>Created</b> = content items created that month (drafts included) · <b>Validated</b> = approved that month ·{" "}
        <b>Scheduled</b> = still queued for a date in that month · <b>Published</b> = content with at least one post live that month (LinkedIn + X of the same post count once).
        Target = posts per week from Settings → Campaign posting objectives × days ÷ 7 (days so far for the current month). Frames: green = target met, orange = 50–99%, red = under 50%.
        {data && <> Updated {new Date(data.generatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}.</>}
      </p>
    </div>
  );
}

function TabBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={"px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors " + (on ? "border-[#FE1B04] text-[#FE1B04]" : "border-transparent text-gray-500 hover:text-gray-800")}
    >
      {children}
    </button>
  );
}

/** The figure a month is judged on: what is planned for next month, what went live otherwise. */
const judged = (f: Funnel, t: MonthTarget) => (t.future ? f.scheduled : f.published);

/* ── Tab 1: output vs target ─────────────────────────────────────────────── */
function TargetTab({ d }: { d: FunnelData }) {
  const { lastM, thisM, nextM } = d.focus;
  const months = [lastM, thisM, nextM];
  const rows = useMemo(
    () => [...d.companies].sort((a, b) => b.months[thisM].published + b.months[lastM].published - a.months[thisM].published - a.months[lastM].published || a.name.localeCompare(b.name)),
    [d, thisM, lastM],
  );
  return (
    <div>
      <div className="text-sm text-gray-600 bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm mb-5">
        <b className="text-gray-900">Goal: hit each company&apos;s posting objective.</b> Each figure is output ÷ the company&apos;s target for the month; 100% = on cadence.{" "}
        {fmtMonth(thisM)} is month-to-date. {fmtMonth(nextM)} is judged on what is already <b className="text-gray-900">scheduled</b> — its planned coverage.
      </div>
      <div className="space-y-5">
        {rows.map((c) => (
          <div key={c.clientId}>
            <CompanyTitle c={c} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {months.map((m) => <TargetBlock key={m} month={m} f={c.months[m]} t={d.targets[c.clientId][m]} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompanyTitle({ c }: { c: CompanyFunnel }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span className="text-sm font-extrabold text-gray-900">{c.name}</span>
      <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">{c.perWeek}/week</span>
      {c.clientType === "INTERNAL" && <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 rounded-full px-2 py-0.5">Internal</span>}
      <Link href={withClient("/publishing", c.clientId)} className="ml-auto text-xs font-medium text-red-700 hover:underline">Content</Link>
      <Link href={withClient("/publishing/calendar", c.clientId)} className="text-xs font-medium text-red-700 hover:underline">Calendar</Link>
    </div>
  );
}

function TargetBlock({ month, f, t }: { month: string; f: Funnel; t: MonthTarget }) {
  const ratio = t.target ? judged(f, t) / t.target : null;
  const tone = frameTone(ratio);
  const st = FRAME_STYLE[tone];
  const idle = !STAGES.some((s) => f[s.k]);
  const stages = STAGES.filter((s) => s.k !== "scheduled" || f.scheduled > 0 || t.future);
  return (
    <div className={"bg-white border-2 rounded-2xl p-4 shadow-sm " + (idle ? "opacity-70" : "")} style={{ borderColor: st.border }}>
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm font-bold text-gray-900">
          {fmtMonth(month)}
          {t.future && <span className="ml-2 text-[10px] font-semibold text-sky-600 bg-sky-50 rounded-full px-2 py-0.5 align-middle">planned</span>}
        </div>
        <div className="text-[11px] text-gray-500">target {t.target} posts{t.current ? " · to date" : ""}</div>
      </div>
      {stages.map((s) => <Bar key={s.k} label={s.label} color={COL[s.k]} val={f[s.k]} target={t.target} />)}
      <div className="mt-3 text-[11px] font-semibold rounded-md px-2 py-1 inline-block" style={{ background: st.bg, color: st.text }}>
        {pctLabel(ratio)} {t.future ? "planned" : "published"} · {st.label}
      </div>
    </div>
  );
}

function Bar({ label, color, val, target }: { label: string; color: string; val: number; target: number }) {
  const pct = target ? Math.round((val / target) * 100) : 0;
  return (
    <div className="mb-2.5 last:mb-0">
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: color }} />{label}
        </div>
        <div>
          <span className="text-lg font-extrabold" style={{ color }}>{pct}%</span>
          <span className="text-[11px] text-gray-500 font-semibold ml-1.5">{val}/{target}</span>
        </div>
      </div>
      <div className="relative h-2 rounded bg-gray-100 overflow-hidden">
        <div className="absolute left-0 top-0 h-2 rounded" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>
    </div>
  );
}

/* ── Tab 2: by company, last vs this month ───────────────────────────────── */
function ClientsTab({ d }: { d: FunnelData }) {
  const { lastM, thisM } = d.focus;
  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200 bg-gray-50/60">
            <th className="py-2 px-3 font-medium">Company</th>
            {STAGES.map((s) => (
              <th key={s.k} className="py-2 px-2 font-medium text-right" colSpan={2}>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: COL[s.k] }} />{s.label}</span>
              </th>
            ))}
            <th className="py-2 px-3 font-medium text-right">vs target ({fmtMonth(thisM)})</th>
          </tr>
          <tr className="text-[10px] text-gray-400 border-b border-gray-200">
            <th />
            {STAGES.map((s) => [
              <th key={s.k + "l"} className="py-1 px-2 font-medium text-right">{fmtMonth(lastM)}</th>,
              <th key={s.k + "t"} className="py-1 px-2 font-medium text-right">{fmtMonth(thisM)}</th>,
            ])}
            <th />
          </tr>
        </thead>
        <tbody>
          {d.companies.map((c) => {
            const t = d.targets[c.clientId][thisM];
            const r = t.target ? c.months[thisM].published / t.target : null;
            const st = FRAME_STYLE[frameTone(r)];
            return (
              <tr key={c.clientId} className="border-b border-gray-100 hover:bg-gray-50/50">
                <td className="py-2 px-3">
                  <div className="font-medium text-gray-900">{c.name}</div>
                  <div className="text-[11px] text-gray-400">{c.perWeek}/week · {c.clientType === "INTERNAL" ? "Internal" : "Campaign"}</div>
                </td>
                {STAGES.map((s) => {
                  const a = c.months[lastM][s.k], b = c.months[thisM][s.k];
                  return [
                    <td key={s.k + "l"} className={`py-2 px-2 text-right tabular-nums ${a ? "text-gray-600" : "text-gray-300"}`}>{a}</td>,
                    <td key={s.k + "t"} className={`py-2 px-2 text-right tabular-nums font-semibold ${b ? "text-gray-900" : "text-gray-300"}`}>{b}</td>,
                  ];
                })}
                <td className="py-2 px-3 text-right">
                  <span className="text-xs font-semibold rounded-md px-2 py-0.5" style={{ background: st.bg, color: st.text, border: `1px solid ${st.border}` }}>
                    {pctLabel(r)} · {c.months[thisM].published}/{t.target}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/* ── Tab 3: all months ───────────────────────────────────────────────────── */
function MonthsTab({ d }: { d: FunnelData }) {
  const totals = d.months.map((m) => {
    const f = { created: 0, validated: 0, scheduled: 0, published: 0 };
    for (const c of d.companies) for (const s of STAGES) f[s.k] += c.months[m][s.k];
    return { m, f };
  });
  const max = Math.max(1, ...totals.flatMap((t) => STAGES.map((s) => t.f[s.k])));
  const lagMax = Math.max(1, ...d.lag.map((l) => l.count));
  const ab = d.approvedBy;
  const abTotal = ab.client + ab.team + ab.autopilot;

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-900">Content funnel by month · all companies{d.companies.length === 1 ? ` (${d.companies[0].name})` : ""}</h3>
          <div className="flex gap-3 text-[11px] text-gray-500">
            {STAGES.map((s) => <span key={s.k} className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: COL[s.k] }} />{s.label}</span>)}
          </div>
        </div>
        <div className="flex items-end gap-2 h-48 overflow-x-auto" role="img" aria-label="Content created, validated, scheduled and published per month">
          {totals.map(({ m, f }) => (
            <div key={m} className="flex flex-col items-center min-w-[52px] flex-1">
              <div className="flex items-end gap-[2px] h-40">
                {STAGES.map((s) => (
                  <div key={s.k} title={`${fmtMonth(m)} · ${s.label}: ${f[s.k]}`} className="w-2.5 rounded-t" style={{ height: `${(f[s.k] / max) * 100}%`, minHeight: f[s.k] ? 2 : 0, background: COL[s.k] }} />
                ))}
              </div>
              <div className={`text-[10px] mt-1 ${m === d.thisMonth ? "font-bold text-gray-900" : "text-gray-500"}`}>{fmtMonth(m).replace(" 20", " ’")}</div>
            </div>
          ))}
        </div>
        <table className="w-full text-xs mt-4">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
              <th className="py-1.5 font-medium">Month</th>
              {STAGES.map((s) => <th key={s.k} className="py-1.5 font-medium text-right">{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {[...totals].reverse().map(({ m, f }) => (
              <tr key={m} className="border-b border-gray-100">
                <td className="py-1.5 text-gray-700">{fmtMonth(m, true)}{m === d.thisMonth ? " · to date" : m > d.thisMonth ? " · planned" : ""}</td>
                {STAGES.map((s) => <td key={s.k} className={`py-1.5 text-right tabular-nums ${f[s.k] ? "text-gray-900" : "text-gray-300"}`}>{f[s.k]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-bold text-gray-900">Validation lag</h3>
          <p className="text-xs text-gray-500 mb-3">
            Time from creating a post to its approval, last 12 months{d.lagMedianDays != null ? ` · median ${d.lagMedianDays} day${d.lagMedianDays === 1 ? "" : "s"}` : ""}.
          </p>
          {d.lag.every((l) => !l.count) ? <p className="text-sm text-gray-400">No approvals yet.</p> : d.lag.map((l) => (
            <div key={l.label} className="flex items-center gap-2 mb-2">
              <div className="w-24 text-xs text-gray-600">{l.label}</div>
              <div className="flex-1 h-3 bg-gray-100 rounded overflow-hidden"><div className="h-3 rounded" style={{ width: `${(l.count / lagMax) * 100}%`, background: COL.validated }} /></div>
              <div className="w-8 text-right text-xs tabular-nums text-gray-800">{l.count}</div>
            </div>
          ))}
        </section>
        <section className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-bold text-gray-900">Who approved</h3>
          <p className="text-xs text-gray-500 mb-3">Approvals in the last 12 months, by source.</p>
          {!abTotal ? <p className="text-sm text-gray-400">No approvals yet.</p> : (
            <>
              <div className="flex h-4 rounded overflow-hidden mb-3">
                {([["Client", ab.client, "#10b981"], ["Team", ab.team, "#6366f1"], ["Autopilot", ab.autopilot, "#f59e0b"]] as const).map(([l, v, c]) =>
                  v ? <div key={l} title={`${l}: ${v}`} style={{ width: `${(v / abTotal) * 100}%`, background: c }} /> : null)}
              </div>
              {([["Client (review page)", ab.client, "#10b981"], ["Gershon team", ab.team, "#6366f1"], ["Autopilot", ab.autopilot, "#f59e0b"]] as const).map(([l, v, c]) => (
                <div key={l} className="flex items-center justify-between text-xs mb-1.5">
                  <span className="inline-flex items-center gap-1.5 text-gray-700"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />{l}</span>
                  <span className="tabular-nums text-gray-900 font-semibold">{v} <span className="text-gray-400 font-normal">· {Math.round((v / abTotal) * 100)}%</span></span>
                </div>
              ))}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
