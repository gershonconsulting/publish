/**
 * Content funnel (v0.12.0) — the CloudCampaign / HeroPost views, rebuilt on
 * Publish's own LIVE data.
 *
 * Olivier, 2026-11-09: "We can remove CloudCampaign and HeroPost, no longer
 * needed, but the views are interesting for Publish." Social's two pages
 * (/clients/by-cloudcampaign, /clients/by-heropost) read frozen June-2026
 * snapshots; this module answers the same questions from ContentItem and
 * ScheduledPost, so nothing has to be re-pulled by hand.
 *
 * Funnel per company per month (business time zone, America/New_York):
 *   Created    — content items created that month (drafts included)
 *   Validated  — content items approved that month (approvedAt)
 *   Scheduled  — content still queued for a date in that month
 *   Published  — content with at least one delivery posted that month
 * Target = the company's posts-per-week objective (Settings) × days / 7 —
 * days elapsed so far for the current month, the whole month otherwise.
 *
 * READ-ONLY. Scope: CAMPAIGN + INTERNAL companies (publishCompanies).
 */
import prisma from "@/lib/db-raw";
import { readObjectives, DEFAULT_PER_WEEK } from "@/lib/campaigns/objectives";
import { BUSINESS_TZ, publishCompanies } from "@/lib/publish-dashboard";
import { localDate } from "@/lib/publish-runway";

/** Same value as AUTOPILOT in lib/autopilot.ts (not imported, to keep this route small). */
const AUTOPILOT = "Autopilot";

export type Funnel = { created: number; validated: number; scheduled: number; published: number };
export type MonthTarget = { target: number; days: number; current: boolean; future: boolean };
export type CompanyFunnel = {
  clientId: string;
  name: string;
  clientType: string;
  perWeek: number;
  months: Record<string, Funnel>;
};
export type LagBucket = { label: string; count: number };
export type FunnelData = {
  generatedAt: string;
  thisMonth: string;
  months: string[]; // oldest → newest, ends with next month
  focus: { lastM: string; thisM: string; nextM: string };
  targets: Record<string, Record<string, MonthTarget>>; // clientId → month → target
  companies: CompanyFunnel[];
  lag: LagBucket[];
  lagMedianDays: number | null;
  approvedBy: { client: number; team: number; autopilot: number };
};

const HISTORY_MONTHS = 12;
const DAY = 86_400_000;

export function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
const ymOf = (d: Date) => localDate(d, BUSINESS_TZ).slice(0, 7);
const empty = (): Funnel => ({ created: 0, validated: 0, scheduled: 0, published: 0 });

/** Posts expected in a month at a posts-per-week cadence. */
export function monthTarget(ym: string, perWeek: number, now: Date): MonthTarget {
  const today = localDate(now, BUSINESS_TZ);
  const thisM = today.slice(0, 7);
  const current = ym === thisM;
  const future = ym > thisM;
  const days = current ? Number(today.slice(8, 10)) : daysInMonth(ym);
  return { target: Math.max(1, Math.round((days / 7) * perWeek)), days, current, future };
}

export async function contentFunnel(orgId: string, clientId: string | null, now = new Date()): Promise<FunnelData> {
  const companies = await publishCompanies(orgId, clientId);
  const thisM = ymOf(now);
  const first = shiftMonth(thisM, -(HISTORY_MONTHS - 1));
  const nextM = shiftMonth(thisM, 1);
  const months: string[] = [];
  for (let m = first; m <= nextM; m = shiftMonth(m, 1)) months.push(m);
  const since = new Date(Date.UTC(+first.slice(0, 4), +first.slice(5, 7) - 1, 1) - 2 * DAY);
  const ids = companies.map((c) => c.id);

  const objectives = await readObjectives(orgId).catch(() => null);
  const perWeek = (id: string) => (objectives ? objectives.companies[id] ?? objectives.default : DEFAULT_PER_WEEK);

  const [items, delivered] = ids.length
    ? await Promise.all([
        prisma.contentItem.findMany({
          where: {
            organizationId: orgId,
            clientId: { in: ids },
            OR: [{ createdAt: { gte: since } }, { approvedAt: { gte: since } }, { scheduledAt: { gte: since } }],
          },
          select: { id: true, clientId: true, status: true, createdAt: true, approvedAt: true, approvedBy: true, approvedRole: true, scheduledAt: true },
        }),
        prisma.scheduledPost.findMany({
          where: { organizationId: orgId, clientId: { in: ids }, OR: [{ postedAt: { gte: since } }, { scheduledAt: { gte: since } }] },
          select: { id: true, contentId: true, clientId: true, status: true, postedAt: true, scheduledAt: true },
        }),
      ])
    : [[], []];

  const byClient = new Map<string, Record<string, Funnel>>(ids.map((id) => [id, Object.fromEntries(months.map((m) => [m, empty()]))]));
  const bump = (cid: string | null, ym: string, k: keyof Funnel, seen?: Set<string>, key?: string) => {
    if (!cid) return;
    const f = byClient.get(cid)?.[ym];
    if (!f) return;
    if (seen && key) {
      const s = `${k}|${cid}|${ym}|${key}`;
      if (seen.has(s)) return;
      seen.add(s);
    }
    f[k]++;
  };

  const lagDays: number[] = [];
  const approvedBy = { client: 0, team: 0, autopilot: 0 };
  const firstDay = first + "-01";
  for (const i of items) {
    if (i.createdAt) bump(i.clientId, ymOf(i.createdAt), "created");
    if (i.approvedAt) {
      bump(i.clientId, ymOf(i.approvedAt), "validated");
      if (localDate(i.approvedAt, BUSINESS_TZ) >= firstDay) {
        lagDays.push(Math.max(0, (i.approvedAt.getTime() - i.createdAt.getTime()) / DAY));
        if (i.approvedBy === AUTOPILOT) approvedBy.autopilot++;
        else if (i.approvedRole === "client") approvedBy.client++;
        else approvedBy.team++;
      }
    }
  }

  // Published / scheduled count CONTENT, not deliveries (one post on LinkedIn + X = 1).
  const seen = new Set<string>();
  const queuedContent = new Set<string>();
  for (const d of delivered) {
    const key = d.contentId || d.id;
    if (d.status === "POSTED" && d.postedAt) bump(d.clientId, ymOf(d.postedAt), "published", seen, key);
    else if ((d.status === "SCHEDULED" || d.status === "POSTING") && d.scheduledAt >= now) {
      bump(d.clientId, ymOf(d.scheduledAt), "scheduled", seen, key);
      queuedContent.add(key);
    }
  }
  // Approved content with a future date but no delivery row yet also counts as planned.
  for (const i of items) {
    if (i.status === "APPROVED" && i.scheduledAt && i.scheduledAt >= now && !queuedContent.has(i.id)) {
      bump(i.clientId, ymOf(i.scheduledAt), "scheduled", seen, i.id);
    }
  }

  const targets: FunnelData["targets"] = {};
  for (const c of companies) targets[c.id] = Object.fromEntries(months.map((m) => [m, monthTarget(m, perWeek(c.id), now)]));

  const buckets: [string, number, number][] = [
    ["Same day", 0, 1], ["1–7 days", 1, 8], ["8–14 days", 8, 15], ["15–30 days", 15, 31], ["Over 30 days", 31, Infinity],
  ];
  const lag = buckets.map(([label, lo, hi]) => ({ label, count: lagDays.filter((d) => d >= lo && d < hi).length }));
  const sorted = [...lagDays].sort((a, b) => a - b);
  const lagMedianDays = sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10 : null;

  return {
    generatedAt: now.toISOString(),
    thisMonth: thisM,
    months,
    focus: { lastM: shiftMonth(thisM, -1), thisM, nextM },
    targets,
    companies: companies.map((c) => ({
      clientId: c.id,
      name: c.name,
      clientType: c.clientType,
      perWeek: perWeek(c.id),
      months: byClient.get(c.id)!,
    })),
    lag,
    lagMedianDays,
    approvedBy,
  };
}
