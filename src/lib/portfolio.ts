/**
 * Portfolio view (v0.13.0, Olivier 2026-11-09: "The dashboard does not make
 * sense … It should be a global dashboard. Per client we should have a
 * dashboard to review where we stand.").
 *
 * One row per company, built from the three feeds the app already has —
 * Summary (month counts, next post), Inventory (ready content, review queue)
 * and Dashboard (connections, actions). Each status comes with the reason in
 * plain words, so the table says WHY a company is red, not just that it is.
 * A feed that could not be read leaves its cells null ("—"), never 0.
 *
 * Pure: no fetch, no React — tested in tests/portfolio.test.mts.
 */

export type Tone = "ok" | "warn" | "bad";

export type SummaryIn = {
  clientId: string; company: string; clientType: string;
  inReview: number; published: number; failed: number; scheduled: number;
  nextScheduledAt: string | null; nextScheduledPlatform: string | null;
  runwayDays: number | null; runwayToHorizon: boolean; runwayLevel: string | null;
  lastPublishedAt: string | null; timezone: string;
};
export type InventoryIn = {
  clientId: string; name: string; coverageDays: number; drafts: number; inReview: number; changesRequested: number;
  oldestReviewDays: number; overdueReviews: number; overdueChanges: number; level: "ok" | "low" | "critical";
};
export type ConnIn = { clientId: string; linkedin: string; x: string; atRisk: number };

export type PortfolioRow = {
  clientId: string;
  name: string;
  clientType: string;
  timezone: string | null;
  tone: Tone;
  /** Plain-English reasons, worst first. Empty when everything is fine. */
  reasons: string[];
  /** Days of approved/scheduled content from today; null = unknown. */
  readyDays: number | null;
  readyToHorizon: boolean;
  /** Drafts + posts sent back with changes — our move. */
  toDo: number | null;
  /** Sent to the client, not approved yet — their move. */
  waiting: number | null;
  oldestWaitingDays: number | null;
  nextPostAt: string | null;
  nextPostPlatform: string | null;
  publishedThisMonth: number | null;
  failedThisMonth: number | null;
  lastPublishedAt: string | null;
  linkedin: string | null;
  x: string | null;
  postsAtRisk: number;
};

const RANK: Record<Tone, number> = { bad: 0, warn: 1, ok: 2 };

/** Days a client may sit on a post before we call it late (matches PUB reminders). */
export const LATE_REVIEW_DAYS = 3;

export function buildPortfolio(input: {
  clients: { id: string; name: string; clientType: string }[];
  summary: SummaryIn[] | null;
  inventory: InventoryIn[] | null;
  connections: ConnIn[] | null;
}): PortfolioRow[] {
  const sum = new Map((input.summary || []).map((r) => [r.clientId, r]));
  const inv = new Map((input.inventory || []).map((r) => [r.clientId, r]));
  const con = new Map((input.connections || []).map((r) => [r.clientId, r]));

  const rows: PortfolioRow[] = input.clients.map((c) => {
    const s = sum.get(c.id);
    const i = inv.get(c.id);
    const k = con.get(c.id);
    const reasons: { tone: Tone; text: string }[] = [];

    // Content ready ahead — Summary's runway is to the end of next month; the inventory's is the 7-day target.
    const readyDays = s?.runwayDays ?? (i ? i.coverageDays : null);
    const readyToHorizon = !!s?.runwayToHorizon;
    const level = s?.runwayLevel ?? i?.level ?? null;
    if (level === "critical") reasons.push({ tone: "bad", text: readyDays === 0 ? "No approved content ready" : `Only ${readyDays} day${readyDays === 1 ? "" : "s"} of content ready` });
    else if (level === "low") reasons.push({ tone: "warn", text: `${readyDays} days of content ready — under the target` });

    if (s && !s.nextScheduledAt && input.summary) reasons.push({ tone: "bad", text: "Nothing scheduled" });

    if (k && k.atRisk > 0) reasons.push({ tone: "bad", text: `${k.atRisk} upcoming post${k.atRisk === 1 ? "" : "s"} cannot go out (connection)` });
    else if (k && (k.linkedin === "missing" || k.x === "missing")) reasons.push({ tone: "warn", text: `${k.linkedin === "missing" ? "LinkedIn" : "X"} not connected` });

    if (s && s.failed > 0) reasons.push({ tone: "warn", text: `${s.failed} post${s.failed === 1 ? "" : "s"} did not go out this month` });

    if (i && i.overdueReviews > 0) reasons.push({ tone: "warn", text: `Client has not approved for ${i.oldestReviewDays} days` });
    if (i && i.overdueChanges > 0) reasons.push({ tone: "warn", text: `${i.overdueChanges} rewrite${i.overdueChanges === 1 ? "" : "s"} waiting on us` });

    const tone: Tone = reasons.some((r) => r.tone === "bad") ? "bad" : reasons.length ? "warn" : "ok";
    reasons.sort((a, b) => RANK[a.tone] - RANK[b.tone]);

    return {
      clientId: c.id,
      name: c.name,
      clientType: c.clientType,
      timezone: s?.timezone ?? null,
      tone,
      reasons: reasons.map((r) => r.text),
      readyDays,
      readyToHorizon,
      toDo: i ? i.drafts + i.changesRequested : null,
      waiting: i ? i.inReview : s ? s.inReview : null,
      oldestWaitingDays: i && i.inReview > 0 ? i.oldestReviewDays : null,
      nextPostAt: s?.nextScheduledAt ?? null,
      nextPostPlatform: s?.nextScheduledPlatform ?? null,
      publishedThisMonth: s ? s.published : null,
      failedThisMonth: s ? s.failed : null,
      lastPublishedAt: s?.lastPublishedAt ?? null,
      linkedin: k ? k.linkedin : null,
      x: k ? k.x : null,
      postsAtRisk: k ? k.atRisk : 0,
    };
  });
  return sortPortfolio(rows);
}

/** Worst first, then the fewest days ready, then by name. */
export function sortPortfolio(rows: PortfolioRow[]): PortfolioRow[] {
  return [...rows].sort(
    (a, b) =>
      RANK[a.tone] - RANK[b.tone] ||
      (a.readyDays ?? Infinity) - (b.readyDays ?? Infinity) ||
      a.name.localeCompare(b.name),
  );
}

export type PortfolioTotals = {
  clients: number; ok: number; warn: number; bad: number;
  toDo: number | null; waiting: number | null; published: number | null; failed: number | null;
};

/** Sums that stay null when the feed behind them was unavailable for every company. */
export function portfolioTotals(rows: PortfolioRow[]): PortfolioTotals {
  const sum = (f: (r: PortfolioRow) => number | null) => {
    const v = rows.map(f).filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
  };
  return {
    clients: rows.length,
    ok: rows.filter((r) => r.tone === "ok").length,
    warn: rows.filter((r) => r.tone === "warn").length,
    bad: rows.filter((r) => r.tone === "bad").length,
    toDo: sum((r) => r.toDo),
    waiting: sum((r) => r.waiting),
    published: sum((r) => r.publishedThisMonth),
    failed: sum((r) => r.failedThisMonth),
  };
}
