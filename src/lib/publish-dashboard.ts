/**
 * Publish's own Dashboard and Summary data (v0.6.0).
 *
 * THREE-PLATFORM-SPLIT.md §14.4 / §15.7: what is going out in the next seven
 * days, how long each company's approved content lasts, where approvals are
 * stuck, whether deliveries worked, whether each company can be published to
 * right now — and the concrete next actions.
 *
 * READ-ONLY over the shared Neon DB (ContentItem, ContentComment,
 * ScheduledPost, OrgSetting). No schema change, no writes: the campaign
 * objectives are READ (readObjectives), never initialised from here.
 *
 * Each section is computed on its own and fails on its own: a section that
 * could not be read comes back { ok: false, error } so the page says
 * "Unavailable" — never a zero.
 *
 * Scope: CAMPAIGN + INTERNAL companies only (PRODUCT_CLIENT_TYPES).
 */
import prisma from "@/lib/db-raw";
import { PRODUCT_CLIENT_TYPES } from "@/lib/product";
import { readObjectives, DEFAULT_PER_WEEK } from "@/lib/campaigns/objectives";
import { destinationsOf, getPublisherState, getRoute, getTarget, liveStatus, validatorOf, NET_LABEL, type Net } from "@/lib/publishing";
import { isOnline, listBrowsers, targetStatus, type PublishBrowser } from "@/lib/publish-browsers";
import { computeRunway, dayLabel, localDate, type Runway, DAY_MS } from "@/lib/publish-runway";
import { EXTENSION_LATEST, PUBLISH_BROWSER_ID_PREFIX } from "@/lib/extension-version";
import { readExtSeen, semverLt } from "@/lib/extension/seen";
import { healthScore } from "@/lib/publish-score";

export const BUSINESS_TZ = "America/New_York";
const STUCK_MS = 20 * 60 * 1000;

export type Section<T> = { ok: true; data: T } | { ok: false; error: string };

async function section<T>(fn: () => Promise<T>): Promise<Section<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "Could not be read" };
  }
}

export type Company = { id: string; name: string; clientType: string; timezone: string };

export async function publishCompanies(orgId: string, clientId?: string | null): Promise<Company[]> {
  const rows = await prisma.client.findMany({
    where: {
      organizationId: orgId,
      archivedAt: null,
      status: { not: "ARCHIVED" },
      clientType: { in: [...PRODUCT_CLIENT_TYPES] },
      ...(clientId ? { id: clientId } : {}),
    },
    select: { id: true, name: true, clientType: true, timezone: true },
    orderBy: [{ clientType: "asc" }, { name: "asc" }],
  });
  return rows.map((r) => ({ ...r, timezone: r.timezone || BUSINESS_TZ }));
}

// ── Windows ──────────────────────────────────────────────────────────────────

export const WINDOWS = ["week", "month", "this_month", "this_year", "all"] as const;
export type WindowKey = (typeof WINDOWS)[number];
export const WINDOW_LABEL: Record<WindowKey, string> = {
  week: "Last week",
  month: "Last month",
  this_month: "This month",
  this_year: "This year",
  all: "All time",
};

/** Start of a window (UTC instant), business time zone for calendar windows. */
export function windowStart(w: WindowKey, now = Date.now()): Date | null {
  if (w === "week") return new Date(now - 7 * DAY_MS);
  if (w === "month") return new Date(now - 30 * DAY_MS);
  if (w === "all") return null;
  const today = localDate(new Date(now), BUSINESS_TZ);
  const first = w === "this_month" ? today.slice(0, 8) + "01" : today.slice(0, 5) + "01-01";
  return zonedMidnight(first, BUSINESS_TZ);
}

/** The UTC instant of 00:00 on a local date in a time zone. */
export function zonedMidnight(ds: string, tz: string): Date {
  const guess = Date.parse(ds + "T00:00:00Z");
  // Offset of the zone at that moment (local - UTC), applied twice to settle DST edges.
  const off = (t: number) => {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(t))
      .reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t;
  };
  let t = guess - off(guess);
  t = guess - off(t);
  return new Date(t);
}

// ── Runway ───────────────────────────────────────────────────────────────────

export type RunwayRow = Runway & { clientId: string; name: string; objectiveFromSettings: boolean };

async function perWeekFor(orgId: string): Promise<{ perWeek: (id: string) => number; fromSettings: (id: string) => boolean }> {
  const o = await readObjectives(orgId).catch(() => null);
  return {
    perWeek: (id) => (o ? o.companies[id] ?? o.default : DEFAULT_PER_WEEK),
    fromSettings: (id) => !!o && (id in o.companies || o.default !== DEFAULT_PER_WEEK),
  };
}

export async function runways(orgId: string, companies: Company[], now = Date.now()): Promise<RunwayRow[]> {
  if (!companies.length) return [];
  const obj = await perWeekFor(orgId);
  const items = await prisma.contentItem.findMany({
    where: { organizationId: orgId, clientId: { in: companies.map((c) => c.id) }, status: { in: ["APPROVED", "SCHEDULED"] } },
    select: { clientId: true, status: true, scheduledAt: true },
  });
  return companies.map((c) => {
    const today = localDate(new Date(now), c.timezone);
    const mine = items.filter((i) => i.clientId === c.id);
    const scheduledDates: string[] = [];
    const approvedDates: string[] = [];
    let approvedPool = 0;
    for (const i of mine) {
      const d = i.scheduledAt ? localDate(i.scheduledAt, c.timezone) : null;
      if (i.status === "SCHEDULED") {
        if (d && d > today) scheduledDates.push(d);
      } else if (d && d > today) approvedDates.push(d);
      else approvedPool++;
    }
    const r = computeRunway({ today, perWeek: obj.perWeek(c.id), scheduledDates, approvedDates, approvedPool });
    return { ...r, clientId: c.id, name: c.name, objectiveFromSettings: obj.fromSettings(c.id) };
  });
}

// ── Next 7 days ──────────────────────────────────────────────────────────────

export type UpcomingRow = {
  id: string; clientId: string | null; company: string; platform: string; target: string | null;
  scheduledAt: string; timezone: string; status: string; text: string; contentId: string | null;
};

async function nextSevenDays(orgId: string, companies: Company[], now: number): Promise<UpcomingRow[]> {
  const byId = new Map(companies.map((c) => [c.id, c]));
  const rows = await prisma.scheduledPost.findMany({
    where: {
      organizationId: orgId,
      clientId: { in: companies.map((c) => c.id) },
      status: { in: ["SCHEDULED", "POSTING"] },
      scheduledAt: { gte: new Date(now - 2 * 3600000), lte: new Date(now + 7 * DAY_MS) },
    },
    orderBy: [{ scheduledAt: "asc" }, { platform: "asc" }],
    take: 300,
    select: { id: true, clientId: true, platform: true, target: true, scheduledAt: true, status: true, text: true, contentId: true },
  });
  return rows.map((r) => {
    const c = r.clientId ? byId.get(r.clientId) : undefined;
    return {
      id: r.id, clientId: r.clientId, company: c?.name ?? "—", platform: r.platform, target: r.target,
      scheduledAt: r.scheduledAt.toISOString(), timezone: c?.timezone ?? BUSINESS_TZ, status: r.status,
      text: r.text.slice(0, 140), contentId: r.contentId,
    };
  });
}

// ── Approval bottlenecks ─────────────────────────────────────────────────────

export type WaitingItem = {
  id: string; clientId: string; company: string; status: string; stage: "client" | "internal" | "revision" | "draft";
  ageDays: number; revisions: number; title: string;
};
export type ApprovalRow = {
  clientId: string; company: string; reviewer: string; reviewerIsTeam: boolean;
  drafts: number; waitingClient: number; waitingInternal: number; changesRequested: number;
  oldestWaitingDays: number | null; revisions: number;
};

/** v0.9.0: how long posts have been waiting, by age band (drafts excluded). */
export type Aging = { band: string; client: number; internal: number; revision: number }[];

async function approvals(orgId: string, companies: Company[], now: number): Promise<{ rows: ApprovalRow[]; oldest: WaitingItem[]; aging: Aging; drafts: number }> {
  if (!companies.length) return { rows: [], oldest: [], aging: [], drafts: 0 };
  const items = await prisma.contentItem.findMany({
    where: { organizationId: orgId, clientId: { in: companies.map((c) => c.id) }, status: { in: ["DRAFT", "IN_REVIEW", "CHANGES_REQUESTED"] } },
    select: { id: true, clientId: true, status: true, title: true, text: true, createdAt: true, submittedAt: true, updatedAt: true },
  });
  const ids = items.map((i) => i.id);
  const comments = ids.length
    ? await prisma.contentComment.findMany({
        where: { contentId: { in: ids }, kind: "changes_requested" },
        select: { contentId: true, createdAt: true },
      })
    : [];
  const revCount = new Map<string, number>();
  const lastChange = new Map<string, number>();
  for (const c of comments) {
    revCount.set(c.contentId, (revCount.get(c.contentId) || 0) + 1);
    lastChange.set(c.contentId, Math.max(lastChange.get(c.contentId) || 0, c.createdAt.getTime()));
  }
  const validators = new Map<string, { name: string; isTeam: boolean }>();
  await Promise.all(
    companies.map(async (c) => {
      const v = await validatorOf(orgId, c.id).catch(() => null);
      validators.set(c.id, { name: v ? (v.isTeam ? "Gershon team" : v.name || v.email || "Client reviewer") : "Unknown", isTeam: v ? v.isTeam : true });
    }),
  );
  const byId = new Map(companies.map((c) => [c.id, c]));
  const waiting: WaitingItem[] = items.map((i) => {
    const v = validators.get(i.clientId!)!;
    const stage: WaitingItem["stage"] =
      i.status === "DRAFT" ? "draft" : i.status === "CHANGES_REQUESTED" ? "revision" : v.isTeam ? "internal" : "client";
    const since =
      i.status === "IN_REVIEW" ? (i.submittedAt ?? i.updatedAt).getTime()
      : i.status === "CHANGES_REQUESTED" ? lastChange.get(i.id) ?? i.updatedAt.getTime()
      : i.createdAt.getTime();
    return {
      id: i.id, clientId: i.clientId!, company: byId.get(i.clientId!)?.name ?? "—", status: i.status, stage,
      ageDays: Math.max(0, Math.floor((now - since) / DAY_MS)), revisions: revCount.get(i.id) || 0,
      title: (i.title || i.text || "").replace(/\s+/g, " ").slice(0, 90),
    };
  });
  const rows: ApprovalRow[] = companies.map((c) => {
    const mine = waiting.filter((w) => w.clientId === c.id);
    const v = validators.get(c.id)!;
    const inReview = mine.filter((w) => w.stage === "client" || w.stage === "internal" || w.stage === "revision");
    return {
      clientId: c.id, company: c.name, reviewer: v.name, reviewerIsTeam: v.isTeam,
      drafts: mine.filter((w) => w.stage === "draft").length,
      waitingClient: mine.filter((w) => w.stage === "client").length,
      waitingInternal: mine.filter((w) => w.stage === "internal").length,
      changesRequested: mine.filter((w) => w.stage === "revision").length,
      oldestWaitingDays: inReview.length ? Math.max(...inReview.map((w) => w.ageDays)) : null,
      revisions: mine.reduce((a, w) => a + w.revisions, 0),
    };
  });
  const oldest = waiting
    .filter((w) => w.stage !== "draft")
    .sort((a, b) => b.ageDays - a.ageDays)
    .slice(0, 12);
  const bands: [string, number, number][] = [["0–1 day", 0, 1], ["2–3 days", 2, 3], ["4–7 days", 4, 7], ["8+ days", 8, 1e9]];
  const aging: Aging = bands.map(([band, lo, hi]) => {
    const inBand = waiting.filter((w) => w.stage !== "draft" && w.ageDays >= lo && w.ageDays <= hi);
    return {
      band,
      client: inBand.filter((w) => w.stage === "client").length,
      internal: inBand.filter((w) => w.stage === "internal").length,
      revision: inBand.filter((w) => w.stage === "revision").length,
    };
  });
  const drafts = waiting.filter((w) => w.stage === "draft").length;
  return { rows: rows.filter((r) => r.drafts + r.waitingClient + r.waitingInternal + r.changesRequested > 0), oldest, aging, drafts };
}

// ── v0.9.0 Trend: the last 14 days, one point per New York day ───────────────

export type TrendPoint = { day: string; created: number; approved: number; published: number; failed: number };

async function trend(orgId: string, companies: Company[], now: number): Promise<TrendPoint[]> {
  const scope = { organizationId: orgId, clientId: { in: companies.map((c) => c.id) } };
  const since = new Date(now - 14 * DAY_MS);
  const [created, approved, posted, failed] = await Promise.all([
    prisma.contentItem.findMany({ where: { ...scope, createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.contentItem.findMany({ where: { ...scope, approvedAt: { gte: since } }, select: { approvedAt: true } }),
    prisma.scheduledPost.findMany({ where: { ...scope, status: "POSTED", postedAt: { gte: since } }, select: { postedAt: true } }),
    prisma.scheduledPost.findMany({ where: { ...scope, status: { in: ["FAILED", "MISSED"] }, updatedAt: { gte: since } }, select: { updatedAt: true } }),
  ]);
  const today = localDate(new Date(now), BUSINESS_TZ);
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) days.push(localDate(new Date(Date.parse(today + "T12:00:00Z") - i * DAY_MS), "UTC"));
  const count = (dates: (Date | null)[]) => {
    const m = new Map<string, number>();
    for (const d of dates) if (d) { const k = localDate(d, BUSINESS_TZ); m.set(k, (m.get(k) || 0) + 1); }
    return m;
  };
  const c = count(created.map((x) => x.createdAt)), a = count(approved.map((x) => x.approvedAt)), p = count(posted.map((x) => x.postedAt)), f = count(failed.map((x) => x.updatedAt));
  return days.map((day) => ({ day, created: c.get(day) || 0, approved: a.get(day) || 0, published: p.get(day) || 0, failed: f.get(day) || 0 }));
}

// ── Delivery health ──────────────────────────────────────────────────────────

export type NetHealth = {
  platform: string; label: string;
  /** POSTED deliveries in the window = delivery claims. */
  published: number;
  /** Seen on the page by the publishing browser right after posting (still the publisher's own claim). */
  seenByPublisher: number;
  /** Independently observed (Social's collection found it). */
  verified: number;
  /** Posted, not confirmed by anyone yet. */
  unconfirmed: number;
  failed: number; missed: number; stuck: number; postingNow: number; upcoming7: number;
};
export type Failure = { id: string; clientId: string | null; company: string; platform: string; status: string; at: string; error: string | null };

async function deliveryHealth(orgId: string, companies: Company[], from: Date | null, now: number): Promise<{ networks: NetHealth[]; failures: Failure[] }> {
  const ids = companies.map((c) => c.id);
  const byId = new Map(companies.map((c) => [c.id, c.name]));
  const scope = { organizationId: orgId, clientId: { in: ids } };
  const range = from ? { gte: from } : undefined;
  const [posted, failed, missed, posting, upcoming, recentFail] = await Promise.all([
    prisma.scheduledPost.findMany({ where: { ...scope, status: "POSTED", ...(range ? { postedAt: range } : {}) }, select: { platform: true, verifiedAt: true, verifiedVia: true } }),
    prisma.scheduledPost.findMany({ where: { ...scope, status: "FAILED", ...(range ? { updatedAt: range } : {}) }, select: { platform: true } }),
    prisma.scheduledPost.findMany({ where: { ...scope, status: "MISSED", ...(range ? { scheduledAt: range } : {}) }, select: { platform: true } }),
    prisma.scheduledPost.findMany({ where: { ...scope, status: "POSTING" }, select: { platform: true, claimedAt: true } }),
    prisma.scheduledPost.findMany({ where: { ...scope, status: "SCHEDULED", scheduledAt: { gte: new Date(now), lte: new Date(now + 7 * DAY_MS) } }, select: { platform: true } }),
    prisma.scheduledPost.findMany({
      where: { ...scope, status: { in: ["FAILED", "MISSED"] }, updatedAt: { gte: from ?? new Date(now - 30 * DAY_MS) } },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { id: true, clientId: true, platform: true, status: true, updatedAt: true, lastError: true },
    }),
  ]);
  const nets: Net[] = ["LINKEDIN", "TWITTER"];
  const networks = nets.map((p) => {
    const pp = posted.filter((x) => x.platform === p);
    const verified = pp.filter((x) => x.verifiedAt && x.verifiedVia !== "extension").length;
    const seenByPublisher = pp.filter((x) => x.verifiedAt && x.verifiedVia === "extension").length;
    const pg = posting.filter((x) => x.platform === p);
    const stuck = pg.filter((x) => !x.claimedAt || now - x.claimedAt.getTime() > STUCK_MS).length;
    return {
      platform: p, label: NET_LABEL[p],
      published: pp.length, seenByPublisher, verified, unconfirmed: pp.length - verified - seenByPublisher,
      failed: failed.filter((x) => x.platform === p).length,
      missed: missed.filter((x) => x.platform === p).length,
      stuck, postingNow: pg.length - stuck,
      upcoming7: upcoming.filter((x) => x.platform === p).length,
    };
  });
  const failures = recentFail.map((f) => ({
    id: f.id, clientId: f.clientId, company: (f.clientId && byId.get(f.clientId)) || "—", platform: f.platform,
    status: f.status, at: f.updatedAt.toISOString(), error: f.lastError,
  }));
  return { networks, failures };
}

// ── Connections ──────────────────────────────────────────────────────────────

export type ConnTarget = { platform: "LINKEDIN" | "TWITTER"; target: string; level: string; message: string; upcoming7: number };
export type ConnRow = {
  clientId: string; company: string; route: "workspace" | "client";
  linkedin: "ready" | "partial" | "missing" | "none"; x: "ready" | "partial" | "missing" | "none";
  targets: ConnTarget[]; atRisk: number; clientBrowser: string | null;
};
export type BrowserView = {
  id: string; kind: "publish" | "social"; label: string; version: string | null; outOfDate: boolean | null;
  lastSeenAt: string; online: boolean; xSignedIn: boolean; x: string[]; linkedinSignedIn: boolean; linkedinName: string | null;
  linkedinPages: number; lastPostAt: string | null; lastError: string | null;
  /** v0.9.0 Settings → Computers. */
  named: boolean; deviceLabel: string;
  state: ComputerState; stateText: string;
};

/**
 * v0.9.0: one word for a computer's Publish extension, as Settings shows it.
 *   working      online, up to date, signed in to at least one network
 *   out_of_date  online but an older extension (update it)
 *   signed_out   online, but signed out of LinkedIn AND X (can't publish)
 *   offline      not checked in for 15+ minutes (Chrome closed, computer asleep)
 */
export type ComputerState = "working" | "out_of_date" | "signed_out" | "offline";
export function computerState(v: { online: boolean; outOfDate: boolean | null; xSignedIn: boolean; linkedinSignedIn: boolean; lastSeenAt: string }, now = Date.now()): { state: ComputerState; text: string } {
  if (!v.online) return { state: "offline", text: `Not working — last check-in ${agoWords(v.lastSeenAt, now)}. Chrome is closed or the computer is asleep.` };
  if (v.outOfDate) return { state: "out_of_date", text: `Not working well — runs an old extension, update to v${EXTENSION_LATEST}.` };
  if (!v.xSignedIn && !v.linkedinSignedIn) return { state: "signed_out", text: "Not working — signed out of LinkedIn and X in this Chrome." };
  return { state: "working", text: "Working — checks in every 5 minutes and can publish." };
}
function agoWords(iso: string, now: number): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function browserView(b: PublishBrowser, now = Date.now()): BrowserView {
  const kind = b.id.startsWith(PUBLISH_BROWSER_ID_PREFIX) ? "publish" : "social";
  return {
    id: b.id, kind, label: b.label, version: b.version,
    outOfDate: kind === "publish" ? (b.version ? semverLt(b.version, EXTENSION_LATEST) : null) : null,
    lastSeenAt: b.lastSeenAt, online: isOnline(b, now),
    xSignedIn: b.x.signedIn, x: b.x.signedIn ? b.x.accounts : [],
    linkedinSignedIn: b.linkedin.signedIn, linkedinName: b.linkedin.name,
    linkedinPages: Object.values(b.li || {}).filter((v) => v.ok).length,
    lastPostAt: b.lastPostAt || null, lastError: b.lastError || null,
    named: !!b.named, deviceLabel: b.deviceLabel || b.label,
    ...(() => {
      const cs = computerState({ online: isOnline(b, now), outOfDate: kind === "publish" ? (b.version ? semverLt(b.version, EXTENSION_LATEST) : null) : null, xSignedIn: b.x.signedIn, linkedinSignedIn: b.linkedin.signedIn, lastSeenAt: b.lastSeenAt }, now);
      return { state: cs.state, stateText: cs.text };
    })(),
  };
}

async function connections(orgId: string, companies: Company[], upcoming: UpcomingRow[], browsers: PublishBrowser[]): Promise<ConnRow[]> {
  return Promise.all(
    companies.map(async (c) => {
      const [t, route] = await Promise.all([getTarget(orgId, c.id), getRoute(orgId, c.id)]);
      const dests = destinationsOf(t);
      const up = upcoming.filter((u) => u.clientId === c.id);
      let clientBrowser: string | null = null;
      let targets: ConnTarget[];
      if (route === "client") {
        const live = liveStatus(await getPublisherState(orgId, c.id));
        clientBrowser = live.overall.label;
        targets = dests.map((d) => {
          const l = d.network === "TWITTER" ? live.x : live.linkedin;
          return {
            platform: d.network, target: d.target, level: l.level === "live" ? "ok" : l.level === "never" ? "missing" : "offline",
            message: `Client's own Chrome — ${l.label}`,
            upcoming7: up.filter((u) => u.platform === d.network).length,
          };
        });
      } else {
        targets = dests.map((d) => {
          const s = targetStatus(browsers, d.network, d.target);
          return {
            platform: d.network, target: d.target, level: s.level, message: s.message,
            upcoming7: up.filter((u) => u.platform === d.network && (u.target || "").toLowerCase().replace(/^@/, "") === d.target.toLowerCase().replace(/^@/, "")).length
              || (dests.filter((x) => x.network === d.network).length === 1 ? up.filter((u) => u.platform === d.network).length : 0),
          };
        });
      }
      const roll = (net: "LINKEDIN" | "TWITTER"): ConnRow["linkedin"] => {
        const ts = targets.filter((x) => x.platform === net);
        if (!ts.length) return "none";
        const ok = ts.filter((x) => x.level === "ok").length;
        return ok === ts.length ? "ready" : ok > 0 ? "partial" : "missing";
      };
      const atRisk = targets.filter((x) => x.level !== "ok").reduce((a, x) => a + x.upcoming7, 0);
      return { clientId: c.id, company: c.name, route, linkedin: roll("LINKEDIN"), x: roll("TWITTER"), targets, atRisk, clientBrowser };
    }),
  );
}

// ── Throughput (what happened in the window) ─────────────────────────────────

export type Throughput = { created: number; submitted: number; approved: number; publishedItems: number; deliveries: number };

async function throughput(orgId: string, companies: Company[], from: Date | null): Promise<Throughput> {
  const scope = { organizationId: orgId, clientId: { in: companies.map((c) => c.id) } };
  const r: { gte: Date } | { not: null } = from ? { gte: from } : { not: null };
  const [created, submitted, approved, deliveries, published] = await Promise.all([
    prisma.contentItem.count({ where: { ...scope, ...(from ? { createdAt: { gte: from } } : {}) } }),
    prisma.contentItem.count({ where: { ...scope, submittedAt: r } }),
    prisma.contentItem.count({ where: { ...scope, approvedAt: r } }),
    prisma.scheduledPost.count({ where: { ...scope, status: "POSTED", postedAt: r } }),
    prisma.scheduledPost.findMany({ where: { ...scope, status: "POSTED", postedAt: r, contentId: { not: null } }, select: { contentId: true }, distinct: ["contentId"] }),
  ]);
  return { created, submitted, approved, publishedItems: published.length, deliveries };
}

// ── Next actions ─────────────────────────────────────────────────────────────

export type Action = { severity: "critical" | "warning" | "info"; company: string | null; text: string; href: string; due?: string | null };

function q(href: string, clientId: string | null): string {
  return clientId ? `${href}${href.includes("?") ? "&" : "?"}client=${clientId}` : href;
}

function buildActions(input: {
  now: number;
  runways: Section<RunwayRow[]>;
  approvals: Section<{ rows: ApprovalRow[]; oldest: WaitingItem[]; aging: Aging; drafts: number }>;
  health: Section<{ networks: NetHealth[]; failures: Failure[] }>;
  conns: Section<ConnRow[]>;
  browsers: Section<BrowserView[]>;
  extension: Section<ExtensionStatus>;
  companies: Company[];
}): Action[] {
  const out: Action[] = [];
  const today = localDate(new Date(input.now), BUSINESS_TZ);
  if (input.runways.ok) {
    for (const r of input.runways.data) {
      if (r.neededIn7 > 0 && r.firstGap) {
        out.push({
          severity: r.level === "critical" ? "critical" : "warning",
          company: r.name,
          text: `${r.name}: ${r.neededIn7} approved post${r.neededIn7 === 1 ? "" : "s"} needed by ${dayLabel(r.firstGap, today)}`,
          href: q("/publishing", r.clientId),
          due: r.firstGap,
        });
      } else if (r.thisMonth.missing + r.nextMonth.missing > 0 && r.firstGap) {
        out.push({
          severity: "info",
          company: r.name,
          text: `${r.name}: ${r.thisMonth.missing + r.nextMonth.missing} more post${r.thisMonth.missing + r.nextMonth.missing === 1 ? "" : "s"} needed to cover through the end of next month (first gap ${dayLabel(r.firstGap, today)})`,
          href: q("/publishing", r.clientId),
          due: r.firstGap,
        });
      }
    }
  }
  if (input.approvals.ok) {
    for (const a of input.approvals.data.rows) {
      const old = input.approvals.data.oldest.filter((w) => w.clientId === a.clientId && w.ageDays >= 2 && (w.stage === "client" || w.stage === "internal"));
      if (old.length) {
        out.push({
          severity: "warning",
          company: a.company,
          text: `${a.company}: ${old.length} post${old.length === 1 ? "" : "s"} waiting for ${old[0].stage === "client" ? `${a.reviewer}'s` : "internal"} approval for ${old[0].ageDays}+ days`,
          href: q("/publishing", a.clientId),
        });
      }
      const rev = input.approvals.data.oldest.filter((w) => w.clientId === a.clientId && w.stage === "revision" && w.ageDays >= 1);
      if (rev.length) {
        out.push({
          severity: "warning",
          company: a.company,
          text: `${a.company}: ${rev.length} revision${rev.length === 1 ? "" : "s"} requested ${rev[0].ageDays}+ day${rev[0].ageDays === 1 ? "" : "s"} ago — rewrite and resubmit`,
          href: q("/publishing", a.clientId),
        });
      }
    }
  }
  if (input.health.ok) {
    for (const n of input.health.data.networks) {
      if (n.stuck) out.push({ severity: "critical", company: null, text: `${n.stuck} ${n.label} post${n.stuck === 1 ? " is" : "s are"} stuck "posting" — check the network before retrying`, href: "/publishing/calendar" });
    }
    const byCompany = new Map<string, Failure[]>();
    for (const f of input.health.data.failures) {
      if (!f.clientId) continue;
      byCompany.set(f.clientId, [...(byCompany.get(f.clientId) || []), f]);
    }
    for (const [cid, fs] of byCompany) {
      out.push({
        severity: "critical",
        company: fs[0].company,
        text: `${fs[0].company}: ${fs.length} post${fs.length === 1 ? "" : "s"} failed or missed recently — check, then retry`,
        href: q("/publishing/calendar", cid),
      });
    }
  }
  if (input.conns.ok) {
    for (const c of input.conns.data) {
      if (c.atRisk > 0) {
        out.push({
          severity: "critical",
          company: c.company,
          text: `${c.company}: ${c.atRisk} post${c.atRisk === 1 ? "" : "s"} in the next 7 days with no Chrome able to publish them`,
          href: q("/publishing/accounts", c.clientId),
        });
      } else if (c.linkedin === "none" && c.x === "none") {
        out.push({ severity: "info", company: c.company, text: `${c.company}: no LinkedIn page or X account set to publish to`, href: q("/publishing/accounts", c.clientId) });
      }
    }
  }
  if (input.browsers.ok) {
    const online = input.browsers.data.filter((b) => b.online);
    if (!online.length) out.push({ severity: "critical", company: null, text: "No publishing Chrome is online — open Chrome on the publishing computer", href: "/extension" });
    const oldPub = input.browsers.data.filter((b) => b.kind === "publish" && b.outOfDate);
    if (oldPub.length) out.push({ severity: "warning", company: null, text: `${oldPub.length} Chrome${oldPub.length === 1 ? " runs" : "s run"} an old Publish extension — update to v${EXTENSION_LATEST}`, href: "/extension" });
  }
  if (input.extension.ok && !input.extension.data.anyPublishBrowser) {
    out.push({ severity: "info", company: null, text: `The Publish extension (v${EXTENSION_LATEST}) has not checked in from any Chrome yet — install it`, href: "/extension" });
  }
  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.due || "9").localeCompare(b.due || "9"));
}

// ── Extension status ─────────────────────────────────────────────────────────

export type ExtensionStatus = {
  latest: string;
  seen: { version: string; lastSeenAt: string; outOfDate: boolean } | null;
  anyPublishBrowser: boolean;
};

async function extensionStatus(browsers: PublishBrowser[]): Promise<ExtensionStatus> {
  const seen = await readExtSeen().catch(() => null);
  return {
    latest: EXTENSION_LATEST,
    seen: seen ? { version: seen.version, lastSeenAt: seen.lastSeenAt, outOfDate: semverLt(seen.version, EXTENSION_LATEST) } : null,
    anyPublishBrowser: browsers.some((b) => b.id.startsWith(PUBLISH_BROWSER_ID_PREFIX)),
  };
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export async function dashboard(orgId: string, opts: { window: WindowKey; clientId?: string | null }, now = Date.now()) {
  const companies = await publishCompanies(orgId, opts.clientId);
  const from = windowStart(opts.window, now);
  const browsersRaw = await section(() => listBrowsers(orgId));
  const browsersList = browsersRaw.ok ? browsersRaw.data : [];
  const upcoming = await section(() => nextSevenDays(orgId, companies, now));
  const [rw, ap, hl, cn, tp, ext, tr] = await Promise.all([
    section(() => runways(orgId, companies, now)),
    section(() => approvals(orgId, companies, now)),
    section(() => deliveryHealth(orgId, companies, from, now)),
    browsersRaw.ok
      ? section(() => connections(orgId, companies, upcoming.ok ? upcoming.data : [], browsersList))
      : Promise.resolve({ ok: false, error: browsersRaw.error } as Section<ConnRow[]>),
    section(() => throughput(orgId, companies, from)),
    section(() => extensionStatus(browsersList)),
    section(() => trend(orgId, companies, now)),
  ]);
  const browsers: Section<BrowserView[]> = browsersRaw.ok ? { ok: true, data: browsersList.map((b) => browserView(b, now)) } : browsersRaw;
  const actions = buildActions({ now, runways: rw, approvals: ap, health: hl, conns: cn, browsers, extension: ext, companies });
  const score = healthScore({ runways: rw, approvals: ap, health: hl, conns: cn, browsers });
  return {
    generatedAt: new Date(now).toISOString(),
    window: opts.window,
    windowLabel: WINDOW_LABEL[opts.window],
    windowFrom: from ? from.toISOString() : null,
    clientId: opts.clientId || null,
    companies: companies.map((c) => ({ id: c.id, name: c.name, clientType: c.clientType })),
    upcoming,
    runway: rw,
    approvals: ap,
    health: hl,
    connections: cn,
    browsers,
    throughput: tp,
    extension: ext,
    trend: tr,
    score,
    actions,
  };
}

// ── Summary (one row per company, one month) ─────────────────────────────────

export type SummaryRow = {
  clientId: string; company: string; clientType: string;
  drafted: number; inReview: number; approved: number; scheduled: number; published: number; failed: number;
  nextScheduledAt: string | null; nextScheduledPlatform: string | null;
  runwayDays: number | null; runwayToHorizon: boolean; runwayLevel: string | null;
  lastPublishedAt: string | null; timezone: string;
};

export function monthRange(ym: string): { from: Date; to: Date; label: string } {
  const [y, m] = ym.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const nextFirst = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return {
    from: zonedMidnight(first, BUSINESS_TZ),
    to: zonedMidnight(nextFirst, BUSINESS_TZ),
    label: new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
  };
}

export function currentMonth(now = Date.now()): string {
  return localDate(new Date(now), BUSINESS_TZ).slice(0, 7);
}

export async function summary(orgId: string, opts: { month: string; clientId?: string | null }, now = Date.now()) {
  const companies = await publishCompanies(orgId, opts.clientId);
  const { from, to, label } = monthRange(opts.month);
  const ids = companies.map((c) => c.id);
  const scope = { organizationId: orgId, clientId: { in: ids } };
  const inMonth = { gte: from, lt: to };
  const [items, deliveries, nextRows, lastRows, rw] = await Promise.all([
    prisma.contentItem.findMany({
      where: { ...scope, OR: [{ createdAt: inMonth }, { approvedAt: inMonth }, { status: { in: ["IN_REVIEW", "CHANGES_REQUESTED"] } }] },
      select: { clientId: true, status: true, createdAt: true, approvedAt: true },
    }),
    prisma.scheduledPost.findMany({
      where: { ...scope, OR: [{ scheduledAt: inMonth }, { postedAt: inMonth }] },
      select: { clientId: true, status: true, scheduledAt: true, postedAt: true },
    }),
    prisma.scheduledPost.findMany({
      where: { ...scope, status: "SCHEDULED", scheduledAt: { gte: new Date(now) } },
      orderBy: { scheduledAt: "asc" },
      distinct: ["clientId"],
      select: { clientId: true, scheduledAt: true, platform: true },
    }),
    prisma.scheduledPost.findMany({
      where: { ...scope, status: "POSTED", postedAt: { not: null } },
      orderBy: { postedAt: "desc" },
      distinct: ["clientId"],
      select: { clientId: true, postedAt: true },
    }),
    section(() => runways(orgId, companies, now)),
  ]);
  const within = (d: Date | null) => !!d && d >= from && d < to;
  const rows: SummaryRow[] = companies.map((c) => {
    const it = items.filter((i) => i.clientId === c.id);
    const dl = deliveries.filter((d) => d.clientId === c.id);
    const next = nextRows.find((n) => n.clientId === c.id);
    const last = lastRows.find((n) => n.clientId === c.id);
    const r = rw.ok ? rw.data.find((x) => x.clientId === c.id) : undefined;
    return {
      clientId: c.id, company: c.name, clientType: c.clientType, timezone: c.timezone,
      drafted: it.filter((i) => within(i.createdAt)).length,
      inReview: it.filter((i) => i.status === "IN_REVIEW" || i.status === "CHANGES_REQUESTED").length,
      approved: it.filter((i) => within(i.approvedAt)).length,
      scheduled: dl.filter((d) => (d.status === "SCHEDULED" || d.status === "POSTING") && within(d.scheduledAt)).length,
      published: dl.filter((d) => d.status === "POSTED" && within(d.postedAt)).length,
      failed: dl.filter((d) => (d.status === "FAILED" || d.status === "MISSED") && within(d.scheduledAt)).length,
      nextScheduledAt: next ? next.scheduledAt.toISOString() : null,
      nextScheduledPlatform: next ? next.platform : null,
      runwayDays: r ? r.daysCovered : null,
      runwayToHorizon: r ? r.coveredToHorizon : false,
      runwayLevel: r ? r.level : null,
      lastPublishedAt: last?.postedAt ? last.postedAt.toISOString() : null,
    };
  });
  return {
    month: opts.month,
    monthLabel: label,
    generatedAt: new Date(now).toISOString(),
    runwayAvailable: rw.ok,
    rows,
  };
}

