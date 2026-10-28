"use client";

/**
 * /dashboard — Publish's dashboard, v0.9.0 (Olivier, 2026-10-28: "a dashboard
 * should be something people understand very quickly and act on — graphs,
 * diagrams and explanation; and it is missing intelligence").
 *
 * Reading order, top to bottom:
 *   1. ONE score (0–100) with a colour and a sentence — are we OK?
 *   2. Intelligence (Cloudflare Workers AI): the briefing and what to do next.
 *   3. Do this now: the specific actions, each with its button.
 *   4. Four charts, each answering one question in its title, with one line of
 *      explanation: enough content? where is it stuck? what goes out this
 *      week? did it go out?
 *   5. The detailed tables (v0.6.0), folded under "Show details".
 * Follows the client picked in the left menu. A part that cannot be read says
 * "Unavailable", never 0.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Loader2, MessageSquare, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { Header } from "@/components/layout/header";
import { useSelectedClient } from "@/lib/selected-client";
import { Card, SectionBody, ago, withClient, type Section } from "@/components/publish/ui";
import { C, Columns, CoverageBars, Donut, Funnel, Legend, Lines, Meter, ScoreRing, TONE_COLOR, type HBarRow } from "@/components/publish/charts";
import { Approvals, Connections, Health, NextSeven, Runway } from "@/components/publish/dashboard-details";
import type { Action, Aging, ApprovalRow, BrowserView, ConnRow, ExtensionStatus, Failure, NetHealth, RunwayRow, Throughput, TrendPoint, UpcomingRow, WaitingItem, WindowKey } from "@/lib/publish-dashboard";
import type { HealthScore } from "@/lib/publish-score";
import type { Analysis } from "@/lib/intelligence";

type Data = {
  generatedAt: string;
  window: WindowKey;
  windowLabel: string;
  companies: { id: string; name: string; clientType: string }[];
  upcoming: Section<UpcomingRow[]>;
  runway: Section<RunwayRow[]>;
  approvals: Section<{ rows: ApprovalRow[]; oldest: WaitingItem[]; aging: Aging; drafts: number }>;
  health: Section<{ networks: NetHealth[]; failures: Failure[] }>;
  connections: Section<ConnRow[]>;
  browsers: Section<BrowserView[]>;
  throughput: Section<Throughput>;
  extension: Section<ExtensionStatus>;
  trend: Section<TrendPoint[]>;
  score: HealthScore;
  actions: Action[];
};

const WINDOWS: { key: WindowKey; label: string }[] = [
  { key: "week", label: "Last 7 days" },
  { key: "month", label: "Last 30 days" },
  { key: "this_month", label: "This month" },
  { key: "this_year", label: "This year" },
  { key: "all", label: "All time" },
];
const ET = "America/New_York";

export function DashboardClient() {
  const { clientId } = useSelectedClient();
  const [win, setWin] = useState<WindowKey>("week");
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const w = window.localStorage.getItem("publish.dashboard.window") as WindowKey | null;
      if (w && WINDOWS.some((x) => x.key === w)) setWin(w);
    } catch {}
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ window: win });
      if (clientId) qs.set("client", clientId);
      const r = await fetch(`/api/publishing/dashboard?${qs}`, { cache: "no-store" });
      const j = await r.json();
      if (j?.success) { setData(j.data); setErr(null); } else setErr(j?.error || "Could not load the dashboard.");
    } catch {
      setErr("Could not load the dashboard.");
    } finally {
      setLoading(false);
    }
  }, [win, clientId]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 120000);
    return () => clearInterval(t);
  }, [load]);

  const pick = (w: WindowKey) => {
    setWin(w);
    try { window.localStorage.setItem("publish.dashboard.window", w); } catch {}
  };
  const company = clientId && data ? data.companies.find((c) => c.id === clientId)?.name : null;

  return (
    <div>
      <Header
        title={company ? `Dashboard — ${company}` : "Dashboard"}
        eyebrow="Publish"
        subtitle="Are we on track? One score, what to do now, and four charts: enough content, approvals, this week's posts, and what went out."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-gray-300 bg-white overflow-hidden">
              {WINDOWS.map((w) => (
                <button
                  key={w.key}
                  onClick={() => pick(w.key)}
                  className={`px-2.5 py-1.5 text-xs font-medium ${win === w.key ? "bg-[#CC3333] text-white" : "text-gray-700 hover:bg-gray-50"}`}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <button onClick={() => void load()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
            </button>
          </div>
        }
      />
      {err && <div className="text-sm rounded-lg px-3 py-2 mb-4 bg-red-50 text-red-800">{err}{data ? " — showing the last loaded data." : ""}</div>}
      {!data ? (
        !err && <div className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
            <ScoreCard s={data.score} label={data.windowLabel} className="xl:col-span-3" />
            <IntelligenceCard win={win} clientId={clientId} className="xl:col-span-2" />
          </div>
          <DoNow actions={data.actions} companies={data.companies} />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <CoverageCard s={data.runway} clientId={clientId} />
            <PipelineCard t={data.throughput} a={data.approvals} label={data.windowLabel} />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <WeekCard s={data.upcoming} clientId={clientId} />
            <DeliveryCard s={data.health} label={data.windowLabel} />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <AgingCard s={data.approvals} clientId={clientId} />
            <TrendCard s={data.trend} />
          </div>
          <ReadinessCard conns={data.connections} browsers={data.browsers} />
          <Details data={data} clientId={clientId} />
          <p className="text-[11px] text-gray-400">Updated {ago(data.generatedAt)} · CAMPAIGN and INTERNAL companies only · posting days run from tomorrow to the end of next month, in each company&apos;s time zone.</p>
        </div>
      )}
    </div>
  );
}

/* ── 1. Score ───────────────────────────────────────────────────────────── */

const TONE_BG = { ok: "bg-emerald-50 text-emerald-800", warn: "bg-amber-50 text-amber-800", bad: "bg-red-50 text-red-800", off: "bg-gray-100 text-gray-600" } as const;
const PART_HREF: Record<string, string> = { coverage: "#coverage", approvals: "#aging", delivery: "#delivery", connections: "#readiness" };

function ScoreCard({ s, label, className = "" }: { s: HealthScore; label: string; className?: string }) {
  return (
    <section className={`bg-white rounded-xl border border-gray-200 p-5 ${className}`}>
      <div className="flex flex-col sm:flex-row gap-5">
        <div className="flex flex-col items-center gap-2 flex-shrink-0">
          <ScoreRing value={s.value} tone={s.tone} label="Publishing health" />
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${TONE_BG[s.tone]}`}>{s.headline}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Publishing health · {label}</div>
          <p className="text-[15px] text-gray-900 font-medium mt-1 leading-snug">{s.verdict}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3 mt-4">
            {s.parts.map((p) => (
              <a key={p.key} href={PART_HREF[p.key]} className="block group">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-700 group-hover:underline">{p.label} <span className="font-normal text-gray-400">· {p.weight}%</span></span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: p.value == null ? C.mute : TONE_COLOR[p.tone] }}>{p.value == null ? "—" : `${p.value}`}</span>
                </div>
                <Meter value={p.value} tone={p.tone} />
                <div className="text-[11px] text-gray-500 mt-1">{p.detail}{p.hint ? ` — ${p.hint}` : ""}</div>
              </a>
            ))}
          </div>
          <p className="text-[10.5px] text-gray-400 mt-3">Green 80+ · Orange 50–79 · Red under 50. A part with nothing to measure is left out, never counted as 0.</p>
        </div>
      </div>
    </section>
  );
}

/* ── 2. Intelligence (Cloudflare Workers AI) ────────────────────────────── */

function IntelligenceCard({ win, clientId, className = "" }: { win: WindowKey; clientId: string; className?: string }) {
  const [a, setA] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = useCallback(async (refresh: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/intelligence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ window: win, client: clientId || null, refresh }) });
      const j = await r.json();
      if (j?.success) setA(j.data); else setErr(j?.error || "Intelligence is unavailable.");
    } catch {
      setErr("Intelligence is unavailable.");
    } finally {
      setBusy(false);
    }
  }, [win, clientId]);

  useEffect(() => { setA(null); void run(false); }, [run]);

  return (
    <section className={`rounded-xl border border-[#F3D3D3] bg-gradient-to-br from-[#FDF2F2] to-white p-5 flex flex-col ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-[#CC3333] text-white flex items-center justify-center"><Sparkles size={15} /></span>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Intelligence</h2>
            <p className="text-[11px] text-gray-500">{a ? (a.source === "ai" ? `AI briefing · Cloudflare Workers AI · ${ago(a.generatedAt)}${a.stale ? " · data changed since" : ""}` : "Rule-based — AI unavailable right now") : "Cloudflare Workers AI"}</p>
          </div>
        </div>
        <button onClick={() => void run(true)} disabled={busy} title="Ask the AI again with the latest numbers" className="text-xs font-medium text-[#A8281F] hover:underline disabled:opacity-50 inline-flex items-center gap-1">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Refresh
        </button>
      </div>
      {!a ? (
        <div className="text-sm text-gray-500 mt-4 flex items-center gap-2">{busy ? <><Loader2 size={14} className="animate-spin" /> Reading the dashboard…</> : err}</div>
      ) : (
        <div className="mt-3 flex-1 flex flex-col">
          <div className="text-[15px] font-semibold text-gray-900">{a.headline}</div>
          <p className="text-sm text-gray-700 mt-1">{a.summary}</p>
          {a.error && a.source === "rules" && <p className="text-[11px] text-amber-700 mt-1">{a.error}</p>}
          {a.suggestions.length > 0 && (
            <ol className="mt-3 space-y-2">
              {a.suggestions.slice(0, 3).map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className={`mt-0.5 w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center flex-shrink-0 ${s.priority === "high" ? "bg-[#CC3333] text-white" : "bg-white border border-gray-300 text-gray-700"}`}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-gray-900 leading-snug">{s.title}</div>
                    {s.why && <div className="text-[11px] text-gray-500">{s.why}</div>}
                  </div>
                  <Link href={s.href} className="text-xs font-semibold text-[#A8281F] whitespace-nowrap hover:underline">{s.kind === "fill_gap" || s.kind === "content_idea" ? "Write with AI" : "Open"} →</Link>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-auto pt-4 flex flex-wrap gap-2">
            <Link href={withClient("/intelligence", clientId)} className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg bg-[#CC3333] hover:bg-[#A8281F] text-white px-3 py-1.5"><Sparkles size={13} /> Full analysis</Link>
            <Link href={withClient("/intelligence?tab=chat", clientId)} className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border border-gray-300 bg-white text-gray-800 px-3 py-1.5 hover:bg-gray-50"><MessageSquare size={13} /> Ask a question</Link>
            <Link href={withClient("/intelligence?tab=create", clientId)} className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border border-gray-300 bg-white text-gray-800 px-3 py-1.5 hover:bg-gray-50"><Wand2 size={13} /> Create content</Link>
          </div>
        </div>
      )}
    </section>
  );
}

/* ── 3. Do this now ─────────────────────────────────────────────────────── */

const SEV = {
  critical: { bar: "bg-red-600", chip: "bg-red-50 text-red-700", word: "Urgent" },
  warning: { bar: "bg-amber-400", chip: "bg-amber-50 text-amber-800", word: "Soon" },
  info: { bar: "bg-gray-300", chip: "bg-gray-100 text-gray-600", word: "When you can" },
} as const;

function DoNow({ actions, companies }: { actions: Action[]; companies: { id: string; name: string }[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? actions : actions.slice(0, 6);
  const idOf = (name: string | null) => (name ? companies.find((c) => c.name === name)?.id ?? null : null);
  return (
    <Card title="Do this now" subtitle="The specific things to do, most urgent first. Each button opens the right page.">
      {actions.length === 0 ? (
        <div className="rounded-lg bg-emerald-50 text-emerald-800 text-sm px-3 py-2.5">Nothing needs attention — content, approvals, deliveries and connections are all on track.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {shown.map((a, i) => {
              const needsContent = /needed/.test(a.text);
              const cid = idOf(a.company);
              return (
                <div key={i} className="relative rounded-lg border border-gray-200 bg-white pl-4 pr-3 py-3 flex flex-col">
                  <span className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${SEV[a.severity].bar}`} />
                  <span className={`self-start text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${SEV[a.severity].chip}`}>{SEV[a.severity].word}</span>
                  <div className="text-sm text-gray-900 mt-1.5 flex-1">{a.text}</div>
                  <div className="flex flex-wrap gap-3 mt-2">
                    <Link href={a.href} className="text-xs font-semibold text-gray-800 hover:underline inline-flex items-center gap-1">Open <ArrowRight size={12} /></Link>
                    {needsContent && cid && (
                      <Link href={`/intelligence?tab=create&client=${cid}`} className="text-xs font-semibold text-[#A8281F] hover:underline inline-flex items-center gap-1"><Wand2 size={12} /> Write the missing posts with AI</Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {actions.length > 6 && (
            <button onClick={() => setAll(!all)} className="mt-3 text-xs font-medium text-gray-600 hover:underline">{all ? "Show fewer" : `Show all ${actions.length}`}</button>
          )}
        </>
      )}
    </Card>
  );
}

/* ── 4a. Content coverage ───────────────────────────────────────────────── */

function CoverageCard({ s, clientId }: { s: Section<RunwayRow[]>; clientId: string }) {
  return (
    <div id="coverage">
      <Card
        title="Do we have enough approved posts?"
        subtitle="Share of each company's posting days (to the end of next month) that already have an approved or scheduled post. Dashed line = 50%."
        right={<Link href={withClient("/publishing", clientId)} className="text-xs font-medium text-gray-600 hover:underline whitespace-nowrap">Content →</Link>}
      >
        <SectionBody s={s}>
          {(rows) => {
            if (!rows.length) return <p className="text-sm text-gray-600">No companies.</p>;
            const bars: HBarRow[] = rows
              .map((r) => {
                const req = r.thisMonth.required + r.nextMonth.required;
                const ok = Math.min(req, r.thisMonth.scheduled + r.thisMonth.approved + r.nextMonth.scheduled + r.nextMonth.approved);
                const ratio = req ? ok / req : null;
                const tone = ratio == null ? "off" : ratio >= 1 ? "ok" : ratio >= 0.5 ? "warn" : "bad";
                return {
                  id: r.clientId, label: r.name, ratio, tone, href: withClient("/publishing", r.clientId),
                  detail: req ? `${ok}/${req} days` : "no posting days",
                  extra: (
                    <span className="inline-flex items-center gap-2">
                      <span className="tabular-nums">{req ? `${ok}/${req}` : "—"}</span>
                      {req > ok && <Link href={`/intelligence?tab=create&client=${r.clientId}`} title="Write the missing posts with AI" className="text-[#A8281F] font-semibold hover:underline">Fill</Link>}
                    </span>
                  ),
                } as HBarRow;
              })
              .sort((a, b) => (a.ratio ?? 2) - (b.ratio ?? 2));
            const red = bars.filter((b) => b.tone === "bad").length;
            return (
              <>
                <CoverageBars rows={bars} />
                <p className="text-xs text-gray-600 mt-3">
                  <b>What it means:</b> {red ? `${red} compan${red === 1 ? "y has" : "ies have"} under half of the posts they need. ` : "No company is under half. "}
                  <b>What to do:</b> press <b>Fill</b> to have AI draft the missing days, then review and approve them.
                </p>
              </>
            );
          }}
        </SectionBody>
      </Card>
    </div>
  );
}

/* ── 4b. Pipeline ───────────────────────────────────────────────────────── */

function PipelineCard({ t, a, label }: { t: Section<Throughput>; a: Data["approvals"]; label: string }) {
  return (
    <Card title={`How much content moved — ${label}`} subtitle="Each step of the pipeline in this period. A big drop between two steps is where content gets stuck.">
      <SectionBody s={t}>
        {(x) => (
          <>
            <Funnel
              steps={[
                { label: "Written", value: x.created, color: "#9CA3AF", hint: "Content items created (by the team, Autopilot or Intelligence)" },
                { label: "Sent for review", value: x.submitted, color: C.blue, hint: "Submitted to the client or to us" },
                { label: "Approved", value: x.approved, color: C.okSoft, hint: "Approved by the reviewer" },
                { label: "Published", value: x.publishedItems, color: C.ok, hint: "Content items with at least one post out" },
              ]}
            />
            <div className="grid grid-cols-3 gap-2 mt-4 text-center">
              <Mini k="Network posts out" v={x.deliveries} />
              <Mini k="Drafts not sent" v={a.ok ? a.data.drafts : null} />
              <Mini k="In review now" v={a.ok ? a.data.aging.reduce((s, b) => s + b.client + b.internal + b.revision, 0) : null} />
            </div>
          </>
        )}
      </SectionBody>
    </Card>
  );
}

function Mini({ k, v }: { k: string; v: number | null }) {
  return (
    <div className="rounded-lg bg-gray-50 px-2 py-2">
      <div className="text-lg font-bold text-gray-900 tabular-nums">{v ?? "—"}</div>
      <div className="text-[10.5px] text-gray-500">{k}</div>
    </div>
  );
}

/* ── 4c. Next 7 days ────────────────────────────────────────────────────── */

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: ET });
}

function WeekCard({ s, clientId }: { s: Section<UpcomingRow[]>; clientId: string }) {
  return (
    <Card title="What goes out in the next 7 days?" subtitle="Scheduled posts per day (New York time), LinkedIn and X. An empty day with no post is a gap in the calendar." right={<Link href={withClient("/publishing/calendar", clientId)} className="text-xs font-medium text-gray-600 hover:underline">Calendar →</Link>}>
      <SectionBody s={s}>
        {(rows) => {
          const cols = [];
          for (let i = 0; i < 7; i++) {
            const d = new Date(Date.now() + i * 86400000);
            const k = d.toLocaleDateString("en-CA", { timeZone: ET });
            const li = rows.filter((r) => dayKey(r.scheduledAt) === k && r.platform === "LINKEDIN").length;
            const x = rows.filter((r) => dayKey(r.scheduledAt) === k && r.platform === "TWITTER").length;
            cols.push({
              label: d.toLocaleDateString("en-US", { weekday: "short", timeZone: ET }),
              sub: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: ET }),
              segs: [{ value: li, color: C.linkedin, title: "LinkedIn" }, { value: x, color: C.x, title: "X" }],
            });
          }
          const empty = cols.filter((c) => c.segs[0].value + c.segs[1].value === 0).length;
          return (
            <>
              <Columns cols={cols} ariaLabel="Scheduled posts per day, next 7 days" />
              <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                <div className="flex gap-4 text-[11px] text-gray-600">
                  <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.linkedin }} /> LinkedIn</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.x }} /> X</span>
                </div>
                <span className="text-xs text-gray-600">{rows.length} post{rows.length === 1 ? "" : "s"} scheduled{empty ? ` · ${empty} empty day${empty === 1 ? "" : "s"}` : ""}</span>
              </div>
            </>
          );
        }}
      </SectionBody>
    </Card>
  );
}

/* ── 4d. Delivery ───────────────────────────────────────────────────────── */

function DeliveryCard({ s, label }: { s: Section<{ networks: NetHealth[]; failures: Failure[] }>; label: string }) {
  return (
    <div id="delivery">
      <Card title={`Did the posts go out? — ${label}`} subtitle="Every scheduled delivery in this period. Verified = Social's collection found the post on the network; Posted = the publishing Chrome says it posted.">
        <SectionBody s={s}>
          {({ networks, failures }) => {
            const sum = (k: keyof NetHealth) => networks.reduce((a, n) => a + (n[k] as number), 0);
            const verified = sum("verified"), seen = sum("seenByPublisher"), unconf = sum("unconfirmed"), failed = sum("failed"), missed = sum("missed"), stuck = sum("stuck");
            const out = verified + seen + unconf;
            const total = out + failed + missed;
            const rate = total ? Math.round((out / total) * 100) : null;
            const parts = [
              { label: "Verified on the network", value: verified, color: C.ok },
              { label: "Posted, seen by the publisher", value: seen, color: "#4ADE80" },
              { label: "Posted, not confirmed yet", value: unconf, color: C.okSoft },
              { label: "Failed", value: failed, color: C.bad },
              { label: "Missed (never tried)", value: missed, color: C.warn },
            ];
            return (
              <>
                <div className="flex flex-col sm:flex-row items-center gap-5">
                  <Donut parts={parts} center={rate == null ? "—" : `${rate}%`} sub={total ? `${out} of ${total} went out` : "no deliveries"} />
                  <div className="flex-1 w-full">
                    <Legend items={parts.map((p) => ({ ...p, value: p.value }))} />
                    {stuck > 0 && <p className="text-xs text-red-700 font-medium mt-2">{stuck} stuck &quot;posting&quot; for 20+ minutes — check the network before retrying.</p>}
                    <div className="flex gap-3 mt-3 text-[11px] text-gray-600">
                      {networks.map((n) => <span key={n.platform}>{n.label}: <b className="text-gray-900">{n.published}</b> out, <b className={n.failed + n.missed ? "text-red-700" : "text-gray-900"}>{n.failed + n.missed}</b> not</span>)}
                    </div>
                  </div>
                </div>
                {failures.length > 0 && (
                  <div className="mt-4 border-t border-gray-100 pt-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Latest problems</div>
                    <ul className="space-y-1">
                      {failures.slice(0, 4).map((f) => (
                        <li key={f.id} className="text-xs text-gray-700 flex justify-between gap-2">
                          <span className="truncate"><b className="font-medium">{f.company}</b> · {f.platform === "TWITTER" ? "X" : "LinkedIn"} · {f.error || (f.status === "MISSED" ? "missed" : "failed")}</span>
                          <Link href={withClient("/publishing/calendar", f.clientId || "")} className="text-[#A8281F] font-semibold whitespace-nowrap hover:underline">Fix</Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            );
          }}
        </SectionBody>
      </Card>
    </div>
  );
}

/* ── 4e. Approval aging ─────────────────────────────────────────────────── */

function AgingCard({ s, clientId }: { s: Data["approvals"]; clientId: string }) {
  return (
    <div id="aging">
      <Card title="How long are posts waiting for approval?" subtitle="Posts in review now, by how long they have waited. Anything at 2+ days is slowing the calendar." right={<Link href={withClient("/publishing", clientId)} className="text-xs font-medium text-gray-600 hover:underline">Review →</Link>}>
        <SectionBody s={s}>
          {({ aging, oldest }) => {
            const total = aging.reduce((a, b) => a + b.client + b.internal + b.revision, 0);
            if (!total) return <div className="rounded-lg bg-emerald-50 text-emerald-800 text-sm px-3 py-2.5">Nothing is waiting for approval.</div>;
            const late = total - (aging[0] ? aging[0].client + aging[0].internal + aging[0].revision : 0);
            return (
              <>
                <Columns
                  height={140}
                  ariaLabel="Posts waiting for approval by age"
                  cols={aging.map((b) => ({
                    label: b.band,
                    segs: [
                      { value: b.client, color: C.blue, title: "waiting for the client" },
                      { value: b.internal, color: C.violet, title: "waiting for us" },
                      { value: b.revision, color: C.warn, title: "changes requested" },
                    ],
                  }))}
                />
                <div className="flex flex-wrap gap-4 mt-2 text-[11px] text-gray-600">
                  <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.blue }} /> Waiting for the client</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.violet }} /> Waiting for us</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.warn }} /> Changes requested</span>
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  <b>{late}</b> of {total} have waited 2+ days.{oldest[0] ? <> Longest: <b>{oldest[0].company}</b> — {oldest[0].ageDays} days.</> : null}
                </p>
              </>
            );
          }}
        </SectionBody>
      </Card>
    </div>
  );
}

/* ── 4f. 14-day trend ───────────────────────────────────────────────────── */

function TrendCard({ s }: { s: Section<TrendPoint[]> }) {
  return (
    <Card title="The last 14 days, day by day" subtitle="Posts written, approved and published each day. Approved should keep pace with published, or the runway shrinks.">
      <SectionBody s={s}>
        {(pts) => {
          const labels = pts.map((p) => new Date(p.day + "T12:00:00Z").toLocaleDateString("en-US", { month: "numeric", day: "numeric", timeZone: "UTC" }));
          const tot = pts.reduce((a, p) => ({ c: a.c + p.created, a: a.a + p.approved, p: a.p + p.published, f: a.f + p.failed }), { c: 0, a: 0, p: 0, f: 0 });
          const series = [
            { key: "created", label: "Written", color: "#9CA3AF", values: pts.map((p) => p.created) },
            { key: "approved", label: "Approved", color: C.blue, values: pts.map((p) => p.approved) },
            { key: "published", label: "Published", color: C.ok, values: pts.map((p) => p.published) },
            { key: "failed", label: "Failed / missed", color: C.bad, values: pts.map((p) => p.failed) },
          ];
          return (
            <>
              <Lines labels={labels} series={series} ariaLabel="Content written, approved, published and failed per day, last 14 days" />
              <div className="flex flex-wrap gap-4 mt-2 text-[11px] text-gray-600">
                {series.map((x) => <span key={x.key} className="inline-flex items-center gap-1"><span className="w-3 h-0.5" style={{ background: x.color }} /> {x.label} <b className="text-gray-900">{tot[x.key === "created" ? "c" : x.key === "approved" ? "a" : x.key === "published" ? "p" : "f"]}</b></span>)}
              </div>
              {tot.a < tot.p && <p className="text-xs text-amber-700 mt-2">Fewer posts were approved ({tot.a}) than published ({tot.p}) — the stock of approved content is going down.</p>}
            </>
          );
        }}
      </SectionBody>
    </Card>
  );
}

/* ── 5. Readiness: companies + computers ────────────────────────────────── */

function ReadinessCard({ conns, browsers }: { conns: Section<ConnRow[]>; browsers: Section<BrowserView[]> }) {
  return (
    <div id="readiness">
      <Card title="Can we publish right now?" subtitle="Companies whose next 7 days can be posted by a Chrome that is online, and the state of each publishing computer." right={<Link href="/settings#computers" className="text-xs font-medium text-gray-600 hover:underline">Computers →</Link>}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionBody s={conns}>
            {(rows) => {
              const withDest = rows.filter((c) => c.linkedin !== "none" || c.x !== "none");
              const ready = withDest.filter((c) => c.atRisk === 0 && [c.linkedin, c.x].every((v) => v === "ready" || v === "none")).length;
              const risk = withDest.filter((c) => c.atRisk > 0);
              const partial = withDest.length - ready - risk.length;
              const notSet = rows.length - withDest.length;
              return (
                <div className="flex items-center gap-5">
                  <Donut
                    size={130}
                    parts={[
                      { label: "Ready", value: ready, color: C.ok },
                      { label: "Partly ready", value: partial, color: C.warn },
                      { label: "Posts at risk", value: risk.length, color: C.bad },
                      { label: "No account set", value: notSet, color: C.off },
                    ]}
                    center={`${ready}/${rows.length}`}
                    sub="ready"
                  />
                  <div className="flex-1">
                    <Legend items={[
                      { label: "Ready", color: C.ok, value: ready },
                      { label: "Partly ready", color: C.warn, value: partial },
                      { label: "Posts at risk (7 days)", color: C.bad, value: risk.length },
                      { label: "No LinkedIn/X set", color: C.off, value: notSet },
                    ]} />
                    {risk.slice(0, 3).map((c) => (
                      <Link key={c.clientId} href={withClient("/publishing/accounts", c.clientId)} className="block text-xs text-red-700 hover:underline mt-1.5">{c.company}: {c.atRisk} post{c.atRisk === 1 ? "" : "s"} no Chrome can publish →</Link>
                    ))}
                  </div>
                </div>
              );
            }}
          </SectionBody>
          <SectionBody s={browsers}>
            {(bs) => {
              if (!bs.length) return <p className="text-sm text-gray-600">No publishing computer has checked in. <Link href="/extension" className="underline">Install the Publish extension</Link>.</p>;
              const by = (st: string) => bs.filter((b) => b.state === st).length;
              return (
                <div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[["Working", by("working"), C.ok], ["Old version", by("out_of_date"), C.warn], ["Signed out", by("signed_out"), C.bad], ["Offline", by("offline"), C.off]].map(([k, v, col]) => (
                      <div key={k as string} className="rounded-lg bg-gray-50 py-2">
                        <div className="text-lg font-bold tabular-nums" style={{ color: (v as number) ? (col as string) : C.mute }}>{v as number}</div>
                        <div className="text-[10.5px] text-gray-500">{k as string}</div>
                      </div>
                    ))}
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {bs.slice(0, 5).map((b) => (
                      <li key={b.id} className="flex items-center gap-2 text-xs">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: b.state === "working" ? C.ok : b.state === "offline" ? C.off : b.state === "out_of_date" ? C.warn : C.bad }} />
                        <span className="font-medium text-gray-800 truncate">{b.label}</span>
                        <span className="ml-auto text-gray-500 whitespace-nowrap">{b.online ? "online" : `seen ${ago(b.lastSeenAt)}`}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            }}
          </SectionBody>
        </div>
      </Card>
    </div>
  );
}

/* ── 6. Details (the v0.6.0 tables) ─────────────────────────────────────── */

function Details({ data, clientId }: { data: Data; clientId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50">
        <span>Show details — the full tables behind the charts</span>
        <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-5 mt-5">
          <NextSeven s={data.upcoming} clientId={clientId} />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Runway s={data.runway} />
            <Approvals s={data.approvals} />
          </div>
          <Health s={data.health} label={data.windowLabel} />
          <Connections s={data.connections} browsers={data.browsers} />
        </div>
      )}
    </section>
  );
}
