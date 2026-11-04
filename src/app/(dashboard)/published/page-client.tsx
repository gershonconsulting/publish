"use client";

/**
 * /published — what went out on one day (ET), grouped by company: network,
 * page / account, time in the company's zone, text, picture and the link to
 * the live post. Also lists what was due that day and did not go out, and
 * what is still to go out today. 14-day strip to jump between days.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Header } from "@/components/layout/header";
import { useSelectedClient } from "@/lib/selected-client";
import { NetBadge, ago, fmtIn, tzAbbr, withClient } from "@/components/publish/ui";
import { shiftDay, type DayDelivery, type DayView } from "@/lib/published-day-model";

function todayET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}
function shortTarget(t: string | null, p: string): string {
  if (!t) return p === "TWITTER" ? "X account" : "LinkedIn";
  if (p === "TWITTER") return "@" + t.replace(/^@/, "");
  const m = t.match(/linkedin\.com\/(company|in|showcase)\/([^/?#]+)/i);
  return m ? m[2] : t;
}

function Row({ d, tz, kind }: { d: DayDelivery; tz: string; kind: "published" | "notOut" | "pending" }) {
  const [open, setOpen] = useState(false);
  const at = kind === "published" ? d.postedAt : d.scheduledAt;
  const long = d.text.length > 220;
  return (
    <li className="flex gap-3 py-3 border-t border-gray-100 first:border-t-0">
      <div className="w-24 shrink-0 text-xs text-gray-600 tabular-nums pt-0.5">
        <div className="font-medium text-gray-900">{fmtIn(at, tz, false)}</div>
        <div className="text-[10px] text-gray-400">{at ? tzAbbr(at, tz) : ""}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-xs mb-1">
          <NetBadge p={d.platform} />
          <span className="text-gray-700 font-medium truncate max-w-[220px]" title={d.target || ""}>{shortTarget(d.target, d.platform)}</span>
          {kind === "published" && (d.verifiedAt
            ? <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold">Verified on the page</span>
            : <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] font-semibold">Not verified yet</span>)}
          {kind === "notOut" && <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 text-[10px] font-semibold">{d.status === "MISSED" ? "Missed" : "Failed"}</span>}
          {kind === "pending" && <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-semibold">{d.status === "POSTING" ? "Going out now" : "Still to go out"}</span>}
        </div>
        <p className="text-sm text-gray-800 whitespace-pre-line break-words">
          {open || !long ? d.text : d.text.slice(0, 220) + "…"}
          {long && <button onClick={() => setOpen((o) => !o)} className="ml-1 text-xs font-medium text-red-700 hover:underline">{open ? "less" : "more"}</button>}
        </p>
        {kind === "notOut" && d.lastError && <p className="mt-1 text-xs text-red-700">{d.lastError}</p>}
        <div className="mt-1 flex gap-3 text-xs">
          {d.postUrl && <a href={d.postUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-red-700 hover:underline">Open the post <ExternalLink size={11} /></a>}
          {kind === "published" && !d.postUrl && <span className="text-gray-400">No link reported</span>}
        </div>
      </div>
      {d.picture && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={d.picture} alt="" className="w-16 h-16 rounded-md object-cover border border-gray-200 shrink-0" />
      )}
    </li>
  );
}

export function PublishedClient() {
  const { clientId } = useSelectedClient();
  const [date, setDate] = useState(todayET());
  const [data, setData] = useState<DayView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ date });
      if (clientId) qs.set("client", clientId);
      const r = await fetch(`/api/publishing/published?${qs}`, { cache: "no-store" });
      const j = await r.json();
      if (j?.success) { setData(j.data); setErr(null); } else setErr(j?.error || "Could not load the published posts.");
    } catch {
      setErr("Could not load the published posts.");
    } finally {
      setLoading(false);
    }
  }, [date, clientId]);
  useEffect(() => { void load(); }, [load]);

  const today = todayET();
  const isToday = date === today;
  const max = Math.max(1, ...(data?.strip || []).map((s) => s.published + s.notOut));
  const t = data?.date === date ? data.totals : null;

  return (
    <div>
      <Header
        title="Published"
        eyebrow="Publish"
        subtitle="Day by day: every post that went out, for which company, on which network — with the link to the live post. Days are New York days."
        actions={
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-lg border border-gray-300 bg-white">
              <button aria-label="Previous day" onClick={() => setDate((d) => shiftDay(d, -1))} className="px-2 py-1.5 hover:bg-gray-50"><ChevronLeft size={15} /></button>
              <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="px-1 py-1 text-sm font-medium text-gray-800 bg-transparent border-0 focus:ring-0" />
              <button aria-label="Next day" disabled={isToday} onClick={() => setDate((d) => shiftDay(d, 1))} className="px-2 py-1.5 hover:bg-gray-50 disabled:opacity-30"><ChevronRight size={15} /></button>
            </div>
            {!isToday && <button onClick={() => setDate(today)} className="px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Today</button>}
            <button onClick={() => void load()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
            </button>
          </div>
        }
      />

      {err && <div className="text-sm rounded-lg px-3 py-2 mb-4 bg-red-50 text-red-800">{err}</div>}

      {data && (
        <section className="bg-white rounded-xl border border-gray-200 p-3 mb-4">
          <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">Last 14 days — click a day</div>
          <div className="flex items-end gap-1 h-16">
            {data.strip.map((s) => {
              const sel = s.date === date;
              return (
                <button key={s.date} onClick={() => setDate(s.date)} title={`${s.date}: ${s.published} published, ${s.notOut} did not go out`}
                  className={`flex-1 flex flex-col justify-end h-full rounded-sm px-0.5 ${sel ? "bg-red-50 ring-1 ring-red-300" : "hover:bg-gray-50"}`}>
                  {s.notOut > 0 && <div className="bg-red-400 rounded-t-sm" style={{ height: `${(s.notOut / max) * 100}%` }} />}
                  <div className={`bg-emerald-500 ${s.notOut ? "" : "rounded-t-sm"}`} style={{ height: `${(s.published / max) * 100}%`, minHeight: s.published ? 2 : 0 }} />
                </button>
              );
            })}
          </div>
          <div className="flex gap-1 mt-1">
            {data.strip.map((s) => (
              <div key={s.date} className={`flex-1 text-center text-[9px] tabular-nums ${s.date === date ? "text-red-700 font-semibold" : "text-gray-400"}`}>
                {new Date(s.date + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", day: "numeric" })}
              </div>
            ))}
          </div>
        </section>
      )}

      {!data ? (
        !err && <div className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</div>
      ) : (
        <>
          <div className="mb-3 text-sm text-gray-800">
            <span className="font-semibold">{data.dateLabel}</span>
            {t && (
              <span className="text-gray-600">
                {" — "}
                <b className="text-gray-900">{t.published}</b> post{t.published === 1 ? "" : "s"} published for <b className="text-gray-900">{t.companies}</b> compan{t.companies === 1 ? "y" : "ies"}
                {t.published > 0 && <> ({t.linkedin} LinkedIn · {t.x} X · {t.verified} verified)</>}
                {t.notOut > 0 && <span className="text-red-700"> · {t.notOut} did not go out</span>}
                {t.pending > 0 && <span className="text-amber-700"> · {t.pending} still to go out</span>}
              </span>
            )}
          </div>

          {data.companies.length === 0 ? (
            <p className="text-sm text-gray-600 bg-white rounded-xl border border-gray-200 p-4">Nothing was published or due {clientId ? "for this company " : ""}on this day.</p>
          ) : (
            <div className="space-y-4">
              {data.companies.map((c) => (
                <section key={c.clientId} className="bg-white rounded-xl border border-gray-200">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
                    <div>
                      <span className="font-semibold text-gray-900">{c.company}</span>
                      <span className="ml-2 text-[11px] text-gray-400">{c.clientType === "INTERNAL" ? "Internal" : "Campaign"}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-emerald-700 font-medium">{c.published.length} published</span>
                      {c.notOut.length > 0 && <span className="text-red-700 font-medium">{c.notOut.length} did not go out</span>}
                      <Link href={withClient("/publishing/calendar", c.clientId)} className="font-medium text-red-700 hover:underline">Calendar</Link>
                    </div>
                  </div>
                  <ul className="px-4">
                    {c.published.map((d) => <Row key={d.id} d={d} tz={c.timezone} kind="published" />)}
                    {c.notOut.map((d) => <Row key={d.id} d={d} tz={c.timezone} kind="notOut" />)}
                    {c.pending.map((d) => <Row key={d.id} d={d} tz={c.timezone} kind="pending" />)}
                  </ul>
                </section>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-gray-400">
            One line per delivery (one LinkedIn page or X account). Published = the post went out that day; Verified = later seen on the page by social.gershon.ai. Times are in each company&apos;s time zone. Updated {ago(data.generatedAt)}.
          </p>
        </>
      )}
    </div>
  );
}
