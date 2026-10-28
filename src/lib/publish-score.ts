/**
 * Publishing health score (v0.9.0) — pure, deterministic, no database.
 *
 * Olivier, 2026-10-28: "a dashboard should be something people understand very
 * quickly". The dashboard opens on ONE number (0–100) with a colour and a
 * sentence, built from four parts anyone can check:
 *
 *   Content coverage  40%  posting days to the end of next month that already
 *                          have an approved or scheduled post
 *   Approvals         20%  posts in review that are NOT stuck (waiting < 2 days)
 *   Delivery          25%  deliveries in the window that went out
 *                          (published ÷ published + failed + missed)
 *   Connections       15%  companies whose next 7 days can be published by an
 *                          online Chrome (no post at risk)
 *
 * A part that cannot be read (database error, or nothing to measure) is left
 * out and the weights are re-balanced — it is never counted as 0 or 100.
 * Spec §14.11: this is the deterministic layer; AI only explains it.
 */
type Section<T> = { ok: true; data: T } | { ok: false; error: string };

type RunwayLike = { clientId: string; name: string; neededIn7: number; thisMonth: { required: number; scheduled: number; approved: number }; nextMonth: { required: number; scheduled: number; approved: number } };
type ApprovalsLike = { oldest: { ageDays: number; stage: string }[]; aging: { client: number; internal: number; revision: number; band: string }[] };
type HealthLike = { networks: { published: number; failed: number; missed: number; stuck: number }[] };
type ConnLike = { clientId: string; atRisk: number; linkedin: string; x: string };
type BrowserLike = { online: boolean };

export type ScoreTone = "ok" | "warn" | "bad";
export type ScorePart = {
  key: "coverage" | "approvals" | "delivery" | "connections";
  label: string;
  weight: number;
  /** 0–100, or null when it cannot be measured. */
  value: number | null;
  tone: ScoreTone | "off";
  /** The figure behind the value, in words: "18 of 25 posting days covered". */
  detail: string;
  /** Why it matters / what to do, one line. */
  hint: string;
};
export type HealthScore = { value: number | null; tone: ScoreTone | "off"; verdict: string; headline: string; parts: ScorePart[] };

export function toneOf(v: number | null): ScoreTone | "off" {
  if (v == null) return "off";
  return v >= 80 ? "ok" : v >= 50 ? "warn" : "bad";
}

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export function healthScore(input: {
  runways: Section<RunwayLike[]>;
  approvals: Section<ApprovalsLike>;
  health: Section<HealthLike>;
  conns: Section<ConnLike[]>;
  browsers: Section<BrowserLike[]>;
}): HealthScore {
  const parts: ScorePart[] = [];
  const problems: { p: number; t: string }[] = []; // p: lower = said first

  // Content coverage
  if (input.runways.ok && input.runways.data.length) {
    let req = 0, ok = 0;
    for (const r of input.runways.data) {
      const rq = r.thisMonth.required + r.nextMonth.required;
      req += rq;
      ok += Math.min(rq, r.thisMonth.scheduled + r.thisMonth.approved + r.nextMonth.scheduled + r.nextMonth.approved);
    }
    const short7 = input.runways.data.filter((r) => r.neededIn7 > 0);
    const v = req ? Math.round((ok / req) * 100) : null;
    parts.push({
      key: "coverage", label: "Content coverage", weight: 40, value: v, tone: toneOf(v),
      detail: req ? `${ok} of ${req} posting days covered to the end of next month` : "No posting days required",
      hint: short7.length ? `${plural(short7.length, "company", "companies")} need approved posts in the next 7 days.` : "Every company has its next 7 days covered.",
    });
    if (short7.length) problems.push({ p: 2, t: `${plural(short7.length, "company", "companies")} ${short7.length === 1 ? "is" : "are"} short of approved posts for the next 7 days` });
  } else {
    parts.push({ key: "coverage", label: "Content coverage", weight: 40, value: null, tone: "off", detail: input.runways.ok ? "No companies" : "Unavailable", hint: "" });
  }

  // Approvals
  if (input.approvals.ok) {
    const waiting = input.approvals.data.aging.reduce((a, b) => a + b.client + b.internal + b.revision, 0);
    const stale = input.approvals.data.aging.filter((b) => b.band !== "0–1 day").reduce((a, b) => a + b.client + b.internal + b.revision, 0);
    const v = waiting ? Math.round(((waiting - stale) / waiting) * 100) : null;
    parts.push({
      key: "approvals", label: "Approvals", weight: 20, value: v, tone: toneOf(v),
      detail: waiting ? `${plural(waiting, "post")} in review, ${stale} waiting 2+ days` : "Nothing waiting for approval",
      hint: stale ? "Chase the reviewers of the posts waiting longest." : "Reviews are moving.",
    });
    if (stale) problems.push({ p: 4, t: `${plural(stale, "post")} waiting for approval for 2+ days` });
  } else {
    parts.push({ key: "approvals", label: "Approvals", weight: 20, value: null, tone: "off", detail: "Unavailable", hint: "" });
  }

  // Delivery
  if (input.health.ok) {
    const n = input.health.data.networks;
    const pub = n.reduce((a, b) => a + b.published, 0);
    const bad = n.reduce((a, b) => a + b.failed + b.missed, 0);
    const stuck = n.reduce((a, b) => a + b.stuck, 0);
    const v = pub + bad ? Math.round((pub / (pub + bad)) * 100) : null;
    parts.push({
      key: "delivery", label: "Delivery", weight: 25, value: v, tone: toneOf(v),
      detail: pub + bad ? `${pub} went out, ${bad} failed or missed${stuck ? `, ${stuck} stuck` : ""}` : "No deliveries in this period",
      hint: bad || stuck ? "Open the failed posts, fix the cause, then retry." : "Every planned post went out.",
    });
    if (bad) problems.push({ p: 1, t: `${plural(bad, "post")} failed or missed` });
    if (stuck) problems.push({ p: 1, t: `${plural(stuck, "post")} stuck "posting"` });
  } else {
    parts.push({ key: "delivery", label: "Delivery", weight: 25, value: null, tone: "off", detail: "Unavailable", hint: "" });
  }

  // Connections
  if (input.conns.ok && input.conns.data.length) {
    const withDest = input.conns.data.filter((c) => c.linkedin !== "none" || c.x !== "none");
    const safe = withDest.filter((c) => c.atRisk === 0);
    const online = input.browsers.ok ? input.browsers.data.filter((b) => b.online).length : null;
    let v = withDest.length ? Math.round((safe.length / withDest.length) * 100) : null;
    if (online === 0 && v != null) v = Math.min(v, 30);
    parts.push({
      key: "connections", label: "Connections", weight: 15, value: v, tone: toneOf(v),
      detail: withDest.length ? `${safe.length} of ${withDest.length} companies can publish their next 7 days${online != null ? ` · ${plural(online, "Chrome")} online` : ""}` : "No LinkedIn page or X account set",
      hint: online === 0 ? "No publishing Chrome is online — open Chrome on a publishing computer." : safe.length < withDest.length ? "Some posts have no Chrome able to publish them." : "Every company can be published.",
    });
    if (online === 0) problems.push({ p: 0, t: "no publishing Chrome is online" });
    const risk = withDest.length - safe.length;
    if (risk) problems.push({ p: 3, t: `${plural(risk, "company", "companies")} with posts no Chrome can publish` });
  } else {
    parts.push({ key: "connections", label: "Connections", weight: 15, value: null, tone: "off", detail: input.conns.ok ? "No companies" : "Unavailable", hint: "" });
  }

  const measured = parts.filter((p) => p.value != null);
  const w = measured.reduce((a, p) => a + p.weight, 0);
  const value = w ? Math.round(measured.reduce((a, p) => a + (p.value as number) * p.weight, 0) / w) : null;
  const tone = toneOf(value);
  const headline = value == null ? "Not enough data yet" : tone === "ok" ? "On track" : tone === "warn" ? "Needs attention" : "At risk";
  const verdict =
    value == null
      ? "There is nothing to measure yet for this selection."
      : problems.length
        ? capital(problems.sort((a, b) => a.p - b.p).slice(0, 3).map((x) => x.t).join("; ")) + "."
        : "Content is covered, approvals are moving, posts go out and every company can be published.";
  return { value, tone, verdict, headline, parts };
}

function capital(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
