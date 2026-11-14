"use client";

/**
 * Global dashboard — "All clients" (v0.13.0, Olivier 2026-11-09: "It should be
 * a global dashboard. Per client we should have a dashboard to review where we
 * stand.").
 *
 * Answers, in this order:
 *   1. How many companies are fine / need attention / are in trouble?
 *   2. What needs doing now (the few most urgent actions, across companies)?
 *   3. Where does each company stand? One row per company, worst first, with
 *      the reason in words — click a row to open that company's dashboard.
 * Replaces the old Summary page (same month numbers, now in the table).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Avatar } from "@/components/layout/client-list";
import { useSelectedClient } from "@/lib/selected-client";
import { NetBadge, ago, fmtIn } from "@/components/publish/ui";
import { buildPortfolio, portfolioTotals, type ConnIn, type InventoryIn, type PortfolioRow, type SummaryIn, type Tone } from "@/lib/portfolio";
import type { Action } from "@/lib/publish-dashboard";

type Feeds = {
  summary: SummaryIn[] | null;
  monthLabel: string | null;
  inventory: InventoryIn[] | null;
  connections: ConnIn[] | null;
  actions: Action[] | null;
  generatedAt: string;
};

const TONE = {
  bad: { dot: "bg-red-600", chip: "bg-red-50 text-red-700 ring-red-200", word: "Needs action" },
  warn: { dot: "bg-amber-400", chip: "bg-amber-50 text-amber-800 ring-amber-200", word: "Watch" },
  ok: { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", word: "On track" },
} as const;

type Filter = "all" | "CAMPAIGN" | "INTERNAL" | "attention";

async function getJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json();
    return j?.success ? j.data : null;
  } catch {
    return null;
  }
}

function thisMonth(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }).slice(0, 7);
}

export function PortfolioDashboard() {
  const { clients, setClientId } = useSelectedClient();
  const router = useRouter();
  const [feeds, setFeeds] = useState<Feeds | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const [s, i, d] = await Promise.all([
      getJson(`/api/publishing/summary?month=${thisMonth()}`),
      getJson(`/api/publishing/inventory`),
      getJson(`/api/publishing/dashboard?window=this_month`),
    ]);
    setFeeds({
      summary: s?.rows ?? null,
      monthLabel: s?.monthLabel ?? null,
      inventory: i?.rows ?? null,
      connections: d?.connections?.ok ? d.connections.data : null,
      actions: d?.actions ?? null,
      generatedAt: new Date().toISOString(),
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 120000);
    return () => clearInterval(t);
  }, [load]);

  // The companies Publish serves: Summary's list when it loaded, else the menu's.
  const companies = useMemo(() => {
    if (feeds?.summary) return feeds.summary.map((r) => ({ id: r.clientId, name: r.company, clientType: r.clientType }));
    return (clients || []).filter((c) => c.clientType === "CAMPAIGN" || c.clientType === "INTERNAL");
  }, [feeds, clients]);

  const rows = useMemo(
    () => (feeds ? buildPortfolio({ clients: companies, summary: feeds.summary, inventory: feeds.inventory, connections: feeds.connections }) : []),
    [feeds, companies],
  );
  const totals = useMemo(() => portfolioTotals(rows), [rows]);
  const shown = rows.filter((r) => (filter === "all" ? true : filter === "attention" ? r.tone !== "ok" : r.clientType === filter));
  const menu = useMemo(() => new Map((clients || []).map((c) => [c.id, c])), [clients]);

  const open = (id: string, href = "/dashboard") => {
    setClientId(id);
    router.push(`${href}?client=${id}`);
  };
  const idOf = (name: string | null) => (name ? companies.find((c) => c.name === name)?.id ?? null : null);

  return (
    <div>
      <Header
        title="All clients"
        eyebrow="Dashboard"
        subtitle="Where every company stands today. Click a company to open its own dashboard."
        actions={
          <button onClick={() => void load()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
          </button>
        }
      />

      {!feeds ? (
        <div className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</div>
      ) : (
        <div className="space-y-6">
          {/* 1. Status at a glance */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Tile icon={<CheckCircle2 size={18} className="text-emerald-600" />} label="On track" value={`${totals.ok}`} sub={`of ${totals.clients} companies`} onClick={() => setFilter("all")} />
            <Tile icon={<AlertTriangle size={18} className="text-amber-500" />} label="To watch" value={`${totals.warn}`} sub="late approval, failures, low content" onClick={() => setFilter("attention")} />
            <Tile icon={<XCircle size={18} className="text-red-600" />} label="Need action" value={`${totals.bad}`} sub="no content, nothing scheduled, blocked" onClick={() => setFilter("attention")} tone={totals.bad > 0 ? "bad" : undefined} />
            <Tile icon={<Clock size={18} className="text-gray-500" />} label="Waiting for clients" value={totals.waiting == null ? "—" : `${totals.waiting}`} sub={`posts sent for approval · ${totals.toDo == null ? "—" : totals.toDo} to write or fix`} />
          </div>

          {/* 2. Do this now (across companies) */}
          {feeds.actions && feeds.actions.length > 0 && (
            <section className="bg-white rounded-xl border border-gray-200">
              <div className="px-4 pt-4 pb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Do this now</h2>
                <span className="text-xs text-gray-500">{feeds.actions.length} action{feeds.actions.length === 1 ? "" : "s"} · most urgent first</span>
              </div>
              <ul className="divide-y divide-gray-100">
                {feeds.actions.slice(0, 6).map((a, n) => {
                  const cid = idOf(a.company);
                  return (
                    <li key={n} className="px-4 py-2.5 flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${a.severity === "critical" ? "bg-red-600" : a.severity === "warning" ? "bg-amber-400" : "bg-gray-300"}`} />
                      {a.company && (
                        <button onClick={() => cid && open(cid)} className="text-sm font-semibold text-gray-900 hover:underline whitespace-nowrap">{a.company}</button>
                      )}
                      <span className="text-sm text-gray-700 flex-1 min-w-0">{a.text}</span>
                      <Link href={a.href} className="text-xs font-semibold text-[#d11200] hover:underline whitespace-nowrap inline-flex items-center gap-1">Fix <ArrowRight size={12} /></Link>
                    </li>
                  );
                })}
              </ul>
              {feeds.actions.length > 6 && <p className="px-4 pb-3 pt-1 text-xs text-gray-500">{feeds.actions.length - 6} more — open each company to see all of its actions.</p>}
            </section>
          )}

          {/* 3. Every company */}
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 pt-4 pb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Every company</h2>
                <p className="text-xs text-gray-500">Worst first. Published and Failed are for {feeds.monthLabel || "this month"}.</p>
              </div>
              <div className="inline-flex rounded-lg border border-gray-300 bg-white overflow-hidden text-xs font-medium">
                {([["all", "All"], ["attention", "Needs attention"], ["CAMPAIGN", "Campaign"], ["INTERNAL", "Internal"]] as [Filter, string][]).map(([k, l]) => (
                  <button key={k} onClick={() => setFilter(k)} className={`px-2.5 py-1.5 ${filter === k ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-50"}`}>{l}</button>
                ))}
              </div>
            </div>
            {shown.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-gray-600">{rows.length ? "Every company in this view is on track." : "No campaign or internal companies yet."}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-y border-gray-200 bg-gray-50/60">
                      <th className="py-2 px-4 font-medium">Company</th>
                      <th className="py-2 px-2 font-medium">Status</th>
                      <th className="py-2 px-2 font-medium" title="Days ahead covered by approved or scheduled posts">Content ready</th>
                      <th className="py-2 px-2 font-medium text-right" title="Drafts and posts sent back with changes — our move">To write</th>
                      <th className="py-2 px-2 font-medium text-right" title="Sent to the client, not approved yet — their move">With client</th>
                      <th className="py-2 px-2 font-medium">Next post</th>
                      <th className="py-2 px-2 font-medium text-right">Published</th>
                      <th className="py-2 px-2 font-medium text-right">Failed</th>
                      <th className="py-2 px-2 font-medium">Connected</th>
                      <th className="py-2 px-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <Row key={r.clientId} r={r} logo={menu.get(r.clientId)?.logoUrl ?? null} onOpen={open} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="text-[11px] text-gray-400">
            Updated {ago(feeds.generatedAt)}. “—” means the number could not be read just now, never zero.
            {!feeds.summary && " Month numbers unavailable."}{!feeds.inventory && " Review queue unavailable."}{!feeds.connections && " Connections unavailable."}
          </p>
        </div>
      )}
    </div>
  );
}

function Tile({ icon, label, value, sub, onClick, tone }: { icon: React.ReactNode; label: string; value: string; sub: string; onClick?: () => void; tone?: Tone }) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">{icon}{label}</div>
      <div className={`text-3xl font-bold tabular-nums mt-1.5 ${tone === "bad" ? "text-red-700" : "text-gray-900"}`}>{value}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300">{body}</button>
  ) : (
    <div className="bg-white rounded-xl border border-gray-200 p-4">{body}</div>
  );
}

function Conn({ label, v }: { label: string; v: string | null }) {
  if (v == null || v === "none") return <span className="text-gray-300 text-xs">{label}</span>;
  const c = v === "ready" ? "text-emerald-700" : v === "partial" ? "text-amber-700" : "text-red-700";
  const mark = v === "ready" ? "✓" : v === "partial" ? "~" : "✗";
  return <span className={`text-xs font-semibold ${c}`} title={`${label}: ${v}`}>{label} {mark}</span>;
}

function n(v: number | null, alarm = false) {
  if (v == null) return <span className="text-gray-300">—</span>;
  if (v === 0) return <span className="text-gray-300">0</span>;
  return <span className={alarm ? "text-red-700 font-semibold" : "text-gray-800"}>{v}</span>;
}

function Row({ r, logo, onOpen }: { r: PortfolioRow; logo: string | null; onOpen: (id: string, href?: string) => void }) {
  const T = TONE[r.tone];
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50/70 cursor-pointer align-top" onClick={() => onOpen(r.clientId)}>
      <td className="py-2.5 px-4">
        <div className="flex items-center gap-2.5">
          <Avatar c={{ id: r.clientId, name: r.name, clientType: r.clientType, logoUrl: logo }} size={28} />
          <div className="min-w-0">
            <div className="font-semibold text-gray-900 truncate max-w-[220px]">{r.name}</div>
            <div className="text-[11px] text-gray-400">{r.clientType === "INTERNAL" ? "Internal" : "Campaign"}</div>
          </div>
        </div>
      </td>
      <td className="py-2.5 px-2 max-w-[260px]">
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ring-1 ${T.chip}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${T.dot}`} /> {T.word}
        </span>
        {r.reasons.length > 0 && <div className="text-[11px] text-gray-600 mt-1 leading-snug">{r.reasons.slice(0, 2).join(" · ")}{r.reasons.length > 2 ? ` · +${r.reasons.length - 2}` : ""}</div>}
      </td>
      <td className="py-2.5 px-2 whitespace-nowrap text-xs">
        {r.readyDays == null ? <span className="text-gray-300">—</span> : r.readyToHorizon ? <span className="text-emerald-700 font-medium">to end of next month</span> : (
          <span className={r.readyDays < 7 ? "text-red-700 font-semibold" : "text-gray-800"}>{r.readyDays} day{r.readyDays === 1 ? "" : "s"}</span>
        )}
      </td>
      <td className="py-2.5 px-2 text-right tabular-nums">{n(r.toDo)}</td>
      <td className="py-2.5 px-2 text-right tabular-nums">
        {n(r.waiting)}
        {r.oldestWaitingDays != null && r.oldestWaitingDays > 0 && <div className="text-[10px] text-gray-400">oldest {r.oldestWaitingDays}d</div>}
      </td>
      <td className="py-2.5 px-2 whitespace-nowrap text-xs">
        {r.nextPostAt ? (
          <span className="inline-flex items-center gap-1">{r.nextPostPlatform && <NetBadge p={r.nextPostPlatform} />}{fmtIn(r.nextPostAt, r.timezone || "America/New_York")}</span>
        ) : r.publishedThisMonth == null ? <span className="text-gray-300">—</span> : <span className="text-red-700 font-medium">nothing scheduled</span>}
      </td>
      <td className="py-2.5 px-2 text-right tabular-nums">{n(r.publishedThisMonth)}</td>
      <td className="py-2.5 px-2 text-right tabular-nums">{n(r.failedThisMonth, true)}</td>
      <td className="py-2.5 px-2 whitespace-nowrap space-x-2"><Conn label="in" v={r.linkedin} /><Conn label="X" v={r.x} /></td>
      <td className="py-2.5 px-4 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => onOpen(r.clientId, "/publishing")} className="text-xs font-medium text-gray-600 hover:underline mr-3">Content</button>
        <button onClick={() => onOpen(r.clientId)} className="text-xs font-semibold text-[#d11200] hover:underline inline-flex items-center gap-1">Open <ArrowRight size={12} /></button>
      </td>
    </tr>
  );
}
