"use client";

/**
 * The v0.6.0 dashboard tables, kept as "Show details" under the v0.9.0
 * dashboard (charts first, tables on demand). Unchanged except for exports.
 */

import { useMemo } from "react";
import Link from "next/link";
import { Card, Dot, NetBadge, SectionBody, StackBar, TextLink, ago, fmtIn, tzAbbr, withClient, type Section } from "@/components/publish/ui";
import type { ApprovalRow, BrowserView, ConnRow, Failure, NetHealth, RunwayRow, UpcomingRow, WaitingItem } from "@/lib/publish-dashboard";

const ET = "America/New_York";

/* ── Next 7 days ──────────────────────────────────────────────────────────── */

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: ET });
}

export function NextSeven({ s, clientId }: { s: Section<UpcomingRow[]>; clientId: string }) {
  return (
    <Card title="Next 7 days" subtitle="Scheduled deliveries by company, network and target, at the company's local time." right={<TextLink href={withClient("/publishing/calendar", clientId)}>Calendar →</TextLink>}>
      <SectionBody s={s}>
        {(rows) => {
          const days: string[] = [];
          const start = new Date();
          for (let i = 0; i < 7; i++) days.push(new Date(start.getTime() + i * 86400000).toLocaleDateString("en-CA", { timeZone: ET }));
          const per = days.map((d) => ({
            d,
            li: rows.filter((r) => dayKey(r.scheduledAt) === d && r.platform === "LINKEDIN").length,
            x: rows.filter((r) => dayKey(r.scheduledAt) === d && r.platform === "TWITTER").length,
          }));
          const max = Math.max(1, ...per.map((p) => p.li + p.x));
          return (
            <div className="space-y-4">
              <WeekBars per={per} max={max} />
              {rows.length === 0 ? (
                <p className="text-sm text-gray-600">Nothing scheduled in the next 7 days.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                        <th className="py-1.5 pr-3 font-medium">When (local)</th>
                        <th className="py-1.5 pr-3 font-medium">ET</th>
                        <th className="py-1.5 pr-3 font-medium">Company</th>
                        <th className="py-1.5 pr-3 font-medium">Network · target</th>
                        <th className="py-1.5 pr-3 font-medium">Post</th>
                        <th className="py-1.5 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 60).map((r) => (
                        <tr key={r.id} className="border-b border-gray-50 align-top">
                          <td className="py-1.5 pr-3 whitespace-nowrap">{fmtIn(r.scheduledAt, r.timezone)} <span className="text-[10px] text-gray-400">{tzAbbr(r.scheduledAt, r.timezone)}</span></td>
                          <td className="py-1.5 pr-3 whitespace-nowrap text-gray-500 text-xs">{fmtIn(r.scheduledAt, ET, false)}</td>
                          <td className="py-1.5 pr-3 whitespace-nowrap">
                            {r.clientId ? <Link className="hover:underline" href={withClient("/publishing", r.clientId)}>{r.company}</Link> : r.company}
                          </td>
                          <td className="py-1.5 pr-3 whitespace-nowrap"><NetBadge p={r.platform} /> <span className="text-xs text-gray-600">{shortTarget(r.platform, r.target)}</span></td>
                          <td className="py-1.5 pr-3 text-xs text-gray-600 max-w-[360px] truncate">{r.text}</td>
                          <td className="py-1.5 text-xs">{r.status === "POSTING" ? <span className="text-amber-700 font-medium">Posting…</span> : <span className="text-gray-600">Scheduled</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > 60 && <p className="text-xs text-gray-500 mt-2">+ {rows.length - 60} more on the Calendar.</p>}
                </div>
              )}
            </div>
          );
        }}
      </SectionBody>
    </Card>
  );
}

function shortTarget(p: string, t: string | null): string {
  if (!t) return "";
  if (p === "TWITTER") return "@" + t.replace(/^@/, "");
  return t.replace(/^https?:\/\/(www\.)?linkedin\.com\//, "").replace(/\/$/, "");
}

/** Hand-drawn SVG: posts per day for the next 7 days, LinkedIn + X stacked. */
function WeekBars({ per, max }: { per: { d: string; li: number; x: number }[]; max: number }) {
  const W = 700, H = 96, pad = 18, bw = 56;
  const step = (W - pad * 2) / per.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full max-w-[760px] h-auto" role="img" aria-label="Scheduled posts per day, next 7 days">
      <line x1={pad} x2={W - pad} y1={H} y2={H} stroke="#E5E7EB" />
      {per.map((p, i) => {
        const x = pad + i * step + (step - bw) / 2;
        const hl = (p.li / max) * (H - 16);
        const hx = (p.x / max) * (H - 16);
        const label = new Date(p.d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" });
        return (
          <g key={p.d}>
            <rect x={x} y={H - hl} width={bw} height={hl} fill="#0A66C2" rx={2}><title>{`${label}: ${p.li} LinkedIn`}</title></rect>
            <rect x={x} y={H - hl - hx} width={bw} height={hx} fill="#111827" rx={2}><title>{`${label}: ${p.x} X`}</title></rect>
            {p.li + p.x > 0 && <text x={x + bw / 2} y={H - hl - hx - 3} textAnchor="middle" fontSize="10" fill="#374151">{p.li + p.x}</text>}
            <text x={x + bw / 2} y={H + 13} textAnchor="middle" fontSize="10" fill="#6B7280">{label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Runway ───────────────────────────────────────────────────────────────── */

const LEVEL_TONE = { ok: "ok", low: "warn", critical: "bad" } as const;

export function Runway({ s }: { s: Section<RunwayRow[]> }) {
  return (
    <Card title="Content runway" subtitle="Posting days covered by scheduled content, then approved content, to the end of next month — against each company's posts-per-week objective (Social → Campaign objectives, 5/week by default).">
      <SectionBody s={s}>
        {(rows) =>
          rows.length === 0 ? (
            <p className="text-sm text-gray-600">No companies.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                    <th className="py-1.5 pr-2 font-medium">Company</th>
                    <th className="py-1.5 pr-2 font-medium text-right">/wk</th>
                    <th className="py-1.5 pr-2 font-medium">Rest of this month</th>
                    <th className="py-1.5 pr-2 font-medium">Next month</th>
                    <th className="py-1.5 font-medium">Covered</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rows].sort((a, b) => a.daysCovered - b.daysCovered).map((r) => (
                    <tr key={r.clientId} className="border-b border-gray-50">
                      <td className="py-1.5 pr-2"><Link className="hover:underline" href={withClient("/publishing", r.clientId)}>{r.name}</Link></td>
                      <td className="py-1.5 pr-2 text-right text-gray-600" title={r.objectiveFromSettings ? "From Campaign objectives" : "Default objective"}>{r.perWeek}</td>
                      <td className="py-1.5 pr-2 w-[150px]"><Period p={r.thisMonth} /></td>
                      <td className="py-1.5 pr-2 w-[150px]"><Period p={r.nextMonth} /></td>
                      <td className="py-1.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <Dot tone={LEVEL_TONE[r.level]} />
                          {r.coveredToHorizon ? "to end of next month" : `${r.daysCovered} day${r.daysCovered === 1 ? "" : "s"}`}
                        </span>
                        {r.firstGap && <div className="text-[11px] text-gray-500">first gap {new Date(r.firstGap + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex gap-4 mt-2 text-[11px] text-gray-500">
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-600" /> scheduled</span>
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-300" /> approved, not scheduled</span>
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-200" /> missing</span>
              </div>
            </div>
          )
        }
      </SectionBody>
    </Card>
  );
}

function Period({ p }: { p: { required: number; scheduled: number; approved: number; missing: number } }) {
  if (!p.required) return <span className="text-xs text-gray-400">no posting days</span>;
  return (
    <div>
      <StackBar
        total={p.required}
        parts={[
          { value: p.scheduled, className: "bg-emerald-600", title: "Scheduled" },
          { value: p.approved, className: "bg-emerald-300", title: "Approved" },
          { value: p.missing, className: "bg-red-200", title: "Missing" },
        ]}
      />
      <div className="text-[11px] text-gray-600 mt-0.5">
        {p.scheduled + p.approved}/{p.required}
        {p.missing > 0 && <span className="text-red-700 font-medium"> · {p.missing} missing</span>}
      </div>
    </div>
  );
}

/* ── Approvals ────────────────────────────────────────────────────────────── */

const STAGE_LABEL: Record<WaitingItem["stage"], string> = {
  client: "Waiting for client",
  internal: "Waiting for internal approval",
  revision: "Revision requested",
  draft: "Draft",
};

export function Approvals({ s }: { s: Section<{ rows: ApprovalRow[]; oldest: WaitingItem[] }> }) {
  return (
    <Card title="Approval bottlenecks" subtitle="Posts waiting on the client, on us, or for a rewrite — and for how long.">
      <SectionBody s={s}>
        {({ rows, oldest }) =>
          rows.length === 0 ? (
            <p className="text-sm text-emerald-800 flex items-center gap-2"><Dot tone="ok" /> Nothing waiting for approval.</p>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                      <th className="py-1.5 pr-2 font-medium">Company</th>
                      <th className="py-1.5 pr-2 font-medium text-right">Client</th>
                      <th className="py-1.5 pr-2 font-medium text-right">Internal</th>
                      <th className="py-1.5 pr-2 font-medium text-right">Revisions</th>
                      <th className="py-1.5 pr-2 font-medium text-right">Drafts</th>
                      <th className="py-1.5 font-medium text-right">Oldest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...rows].sort((a, b) => (b.oldestWaitingDays ?? -1) - (a.oldestWaitingDays ?? -1)).map((r) => (
                      <tr key={r.clientId} className="border-b border-gray-50">
                        <td className="py-1.5 pr-2">
                          <Link className="hover:underline" href={withClient("/publishing", r.clientId)}>{r.company}</Link>
                          <div className="text-[11px] text-gray-400">reviewer: {r.reviewer}</div>
                        </td>
                        <td className="py-1.5 pr-2 text-right">{r.waitingClient || <span className="text-gray-300">0</span>}</td>
                        <td className="py-1.5 pr-2 text-right">{r.waitingInternal || <span className="text-gray-300">0</span>}</td>
                        <td className="py-1.5 pr-2 text-right">{r.changesRequested ? <span className="text-amber-700 font-medium">{r.changesRequested}</span> : <span className="text-gray-300">0</span>}</td>
                        <td className="py-1.5 pr-2 text-right text-gray-600">{r.drafts}</td>
                        <td className={`py-1.5 text-right whitespace-nowrap ${r.oldestWaitingDays != null && r.oldestWaitingDays >= 2 ? "text-red-700 font-medium" : "text-gray-600"}`}>
                          {r.oldestWaitingDays == null ? "—" : `${r.oldestWaitingDays} d`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {oldest.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Waiting longest</div>
                  <ul className="space-y-1">
                    {oldest.slice(0, 8).map((w) => (
                      <li key={w.id} className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate">
                          <b className="font-medium text-gray-800">{w.company}</b> · {STAGE_LABEL[w.stage]}
                          {w.revisions > 0 && ` · ${w.revisions} revision${w.revisions === 1 ? "" : "s"}`} — <span className="text-gray-500">{w.title}</span>
                        </span>
                        <span className="whitespace-nowrap text-gray-600">{w.ageDays} d</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        }
      </SectionBody>
    </Card>
  );
}

/* ── Delivery health ──────────────────────────────────────────────────────── */

export function Health({ s, label }: { s: Section<{ networks: NetHealth[]; failures: Failure[] }>; label: string }) {
  return (
    <Card title={`Delivery health — ${label}`} subtitle="Published = the publishing browser says it posted (a claim). Verified = Social's collection independently found the post. Stuck = claimed 20+ minutes ago with no result.">
      <SectionBody s={s}>
        {({ networks, failures }) => (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {networks.map((n) => (
                <div key={n.platform} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex items-center gap-2 mb-2"><NetBadge p={n.platform} /><span className="text-sm font-semibold text-gray-900">{n.label}</span></div>
                  <StackBar
                    height={10}
                    parts={[
                      { value: n.verified, className: "bg-emerald-600", title: "Verified" },
                      { value: n.seenByPublisher, className: "bg-emerald-400", title: "Seen on the page by the publisher" },
                      { value: n.unconfirmed, className: "bg-emerald-200", title: "Posted, not confirmed yet" },
                      { value: n.failed, className: "bg-red-600", title: "Failed" },
                      { value: n.missed, className: "bg-orange-400", title: "Missed" },
                    ]}
                  />
                  <dl className="grid grid-cols-4 gap-2 mt-2 text-xs">
                    <Stat k="Published" v={n.published} />
                    <Stat k="Verified" v={n.verified} />
                    <Stat k="Seen by publisher" v={n.seenByPublisher} />
                    <Stat k="Unconfirmed" v={n.unconfirmed} />
                    <Stat k="Failed" v={n.failed} bad />
                    <Stat k="Missed" v={n.missed} bad />
                    <Stat k="Stuck posting" v={n.stuck} bad />
                    <Stat k="Next 7 days" v={n.upcoming7} />
                  </dl>
                </div>
              ))}
            </div>
            {failures.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Recent failures and misses</div>
                <ul className="space-y-1">
                  {failures.map((f) => (
                    <li key={f.id} className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate">
                        <NetBadge p={f.platform} /> <b className="font-medium text-gray-800">{f.company}</b> · {f.status === "MISSED" ? "missed" : "failed"} — <span className="text-gray-500">{f.error || "no reason recorded"}</span>
                      </span>
                      <span className="whitespace-nowrap text-gray-500">{ago(f.at)} · <TextLink href={withClient("/publishing/calendar", f.clientId)}>Open</TextLink></span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </SectionBody>
    </Card>
  );
}

function Stat({ k, v, bad }: { k: string; v: number; bad?: boolean }) {
  return (
    <div>
      <dt className="text-gray-500">{k}</dt>
      <dd className={`text-base font-semibold ${bad && v > 0 ? "text-red-700" : "text-gray-900"}`}>{v}</dd>
    </div>
  );
}

/* ── Connections ──────────────────────────────────────────────────────────── */

const READY_TONE = { ready: "ok", partial: "warn", missing: "bad", none: "off" } as const;
const READY_WORD = { ready: "Ready", partial: "Partly ready", missing: "Not ready", none: "Not set" } as const;

export function Connections({ s, browsers }: { s: Section<ConnRow[]>; browsers: Section<BrowserView[]> }) {
  const summary = useMemo(() => {
    if (!s.ok) return null;
    const full = s.data.filter((c) => [c.linkedin, c.x].every((v) => v === "ready" || v === "none") && (c.linkedin !== "none" || c.x !== "none")).length;
    return { full, total: s.data.length };
  }, [s]);
  return (
    <Card
      title="Connection readiness"
      subtitle="Can each company be published to right now — by which Chrome — and how many of the next 7 days' posts are at risk."
      right={<TextLink href="/publishing/accounts">Connections →</TextLink>}
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2">
          <SectionBody s={s}>
            {(rows) => (
              <>
                {summary && <p className="text-xs text-gray-600 mb-2">{summary.full} of {summary.total} companies fully ready.</p>}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                        <th className="py-1.5 pr-2 font-medium">Company</th>
                        <th className="py-1.5 pr-2 font-medium">LinkedIn</th>
                        <th className="py-1.5 pr-2 font-medium">X</th>
                        <th className="py-1.5 pr-2 font-medium text-right">At risk (7 d)</th>
                        <th className="py-1.5 font-medium">Blocker / next action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...rows].sort((a, b) => b.atRisk - a.atRisk).map((c) => {
                        const blocker = c.targets.find((t) => t.level !== "ok");
                        return (
                          <tr key={c.clientId} className="border-b border-gray-50 align-top">
                            <td className="py-1.5 pr-2">
                              <Link className="hover:underline" href={withClient("/publishing/accounts", c.clientId)}>{c.company}</Link>
                              {c.route === "client" && <div className="text-[11px] text-gray-400">publishes from the client&apos;s own Chrome</div>}
                            </td>
                            <td className="py-1.5 pr-2 whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><Dot tone={READY_TONE[c.linkedin]} />{READY_WORD[c.linkedin]}</span></td>
                            <td className="py-1.5 pr-2 whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><Dot tone={READY_TONE[c.x]} />{READY_WORD[c.x]}</span></td>
                            <td className={`py-1.5 pr-2 text-right ${c.atRisk ? "text-red-700 font-semibold" : "text-gray-400"}`}>{c.atRisk}</td>
                            <td className="py-1.5 text-xs text-gray-600">{blocker ? blocker.message : c.targets.length ? "—" : "No LinkedIn page or X account set."}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </SectionBody>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Publishing Chromes</div>
          <SectionBody s={browsers}>
            {(bs) =>
              bs.length === 0 ? (
                <p className="text-xs text-gray-600">No Chrome has checked in. <Link className="underline" href="/extension">Install the Publish extension</Link>.</p>
              ) : (
                <ul className="space-y-2">
                  {bs.map((b) => (
                    <li key={b.id} className="text-xs">
                      <div className="flex items-center gap-1.5">
                        <Dot tone={b.online ? "ok" : "off"} />
                        <span className="font-medium text-gray-800 truncate">{b.label}</span>
                        <span className={`ml-auto ${b.outOfDate ? "text-red-600 font-medium" : "text-gray-400"}`}>{b.kind === "publish" ? "Publish" : "Social"} v{b.version || "?"}</span>
                      </div>
                      <div className="text-gray-500 pl-3.5">
                        {b.online ? "online" : `last seen ${ago(b.lastSeenAt)}`} · LinkedIn {b.linkedinSignedIn ? `✓ (${b.linkedinPages} page${b.linkedinPages === 1 ? "" : "s"})` : "signed out"} · X {b.xSignedIn ? (b.x.length ? "@" + b.x.join(", @") : "✓") : "signed out"}
                      </div>
                    </li>
                  ))}
                </ul>
              )
            }
          </SectionBody>
        </div>
      </div>
    </Card>
  );
}
