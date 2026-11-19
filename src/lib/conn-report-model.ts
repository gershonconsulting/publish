/**
 * v0.21.0 — weekly connections report (Olivier 2026-11-19: "Warning of lack of
 * connections weekly by email to report").
 *
 * Pure logic (tests/conn-report.test.mts). For every company Publish posts for,
 * each destination (LinkedIn, X) gets one line: is it connected directly (API),
 * so posting does not depend on a Chrome being on? Worst first.
 */
import { netState, describe, type ConnEvent, type LinkedLike, type LogNet } from "./conn-log-model";

export const EXPIRING_DAYS = 14;
const DAY = 86400000;

export type ConnLevel = "red" | "orange" | "ok";
export type ConnIssue = "missing" | "expired" | "error" | "mismatch" | "expiring" | "no_destination" | "group" | "ok";

export type ConnLine = { net: LogNet; level: ConnLevel; issue: ConnIssue; text: string; as: string | null; target: string | null };
export type ConnReportRow = { clientId: string; name: string; level: ConnLevel; lines: ConnLine[]; changes: string[] };

type Author = { urn: string; name: string; vanity: string | null; kind: string; id?: string };

/** Same rule as liAuthorMatches in linked-accounts.ts (kept pure here). */
export function liPostsTo(l: LinkedLike, target: string): boolean {
  const c = l.linkedin;
  if (!c?.author) return false;
  if (/\/groups\//i.test(target)) return false;
  const a = (c.authors as Author[]).find((x) => x.urn === c.author);
  if (!a) return false;
  if (a.kind === "person") return /\/in\//i.test(target);
  const m = target.match(/linkedin\.com\/(?:company|showcase)\/([^/?#]+)/i);
  if (!m) return false;
  const slug = decodeURIComponent(m[1]).toLowerCase();
  const id = a.id ?? a.urn.split(":").pop() ?? "";
  return slug === id || (!!a.vanity && slug === a.vanity.toLowerCase());
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });

export function connLine(net: LogNet, target: string | null, l: LinkedLike, now = Date.now()): ConnLine {
  const label = net === "x" ? "X" : "LinkedIn";
  const s = netState(l, net, now);
  const base = { net, as: s.as, target };
  if (!target) return { ...base, level: "orange", issue: "no_destination", text: `No ${label} destination set` };
  if (net === "linkedin" && /\/groups\//i.test(target)) return { ...base, level: "ok", issue: "group", text: "LinkedIn group — Chrome extension only (the API cannot post in groups)" };
  if (s.status === "none") return { ...base, level: "red", issue: "missing", text: `${label} not connected — posts depend on a Chrome signed in to ${label}` };
  if (s.status === "expired") return { ...base, level: "red", issue: "expired", text: `${label} connection expired${s.expiry ? ` on ${fmt(s.expiry)}` : ""} — needs a new Allow` };
  if (s.status === "error") return { ...base, level: "red", issue: "error", text: `${label} connection stopped working${s.error ? `: ${s.error}` : ""}` };
  const matches = net === "x"
    ? !!l.x && l.x.username.toLowerCase() === target.replace(/^@/, "").toLowerCase()
    : liPostsTo(l, target);
  if (!matches) return { ...base, level: "orange", issue: "mismatch", text: `${label} connected as ${s.as ?? "another account"}, but posts go to ${net === "x" ? `@${target.replace(/^@/, "")}` : target}` };
  if (s.expiry) {
    const left = Date.parse(s.expiry) - now;
    if (Number.isFinite(left) && left <= EXPIRING_DAYS * DAY) return { ...base, level: "orange", issue: "expiring", text: `${label} connection expires ${fmt(s.expiry)} — ask for a new Allow` };
  }
  return { ...base, level: "ok", issue: "ok", text: `${label} connected${s.as ? ` as ${s.as}` : ""}` };
}

const RANK: Record<ConnLevel, number> = { red: 0, orange: 1, ok: 2 };

export function connRow(
  c: { clientId: string; name: string; linkedinUrl: string | null; xHandle: string | null },
  l: LinkedLike,
  events: ConnEvent[],
  since: number,
  now = Date.now(),
): ConnReportRow {
  const lines = [connLine("linkedin", c.linkedinUrl, l, now), connLine("x", c.xHandle, l, now)];
  const level = lines.reduce<ConnLevel>((w, x) => (RANK[x.level] < RANK[w] ? x.level : w), "ok");
  const changes = events
    .filter((e) => !e.inferred && e.kind !== "seen" && Date.parse(e.at) >= since && Date.parse(e.at) <= now)
    .map((e) => `${fmt(e.at)}: ${describe(e)}`);
  return { clientId: c.clientId, name: c.name, level, lines, changes };
}

export function sortRows(rows: ConnReportRow[]): ConnReportRow[] {
  return rows.slice().sort((a, b) => RANK[a.level] - RANK[b.level] || a.name.localeCompare(b.name));
}

/** "Nov 12–18, 2026" (or across months / years) for the 7 days ending the day before `now`, New York. */
export function weekRange(now = Date.now()): { since: number; label: string } {
  const end = new Date(now - DAY);
  const start = new Date(now - 7 * DAY);
  const p = (d: Date) => Object.fromEntries(new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }).formatToParts(d).map((x) => [x.type, x.value]));
  const a = p(start), b = p(end);
  const label = a.year !== b.year ? `${a.month} ${a.day}, ${a.year} – ${b.month} ${b.day}, ${b.year}`
    : a.month !== b.month ? `${a.month} ${a.day} – ${b.month} ${b.day}, ${b.year}`
    : `${a.month} ${a.day}–${b.day}, ${b.year}`;
  return { since: now - 7 * DAY, label };
}

/** Send day: Monday, New York. Key = the Monday's date, so it goes once a week. */
export function weeklyDue(now: number, lastKey: string | null): { due: boolean; key: string } {
  const day = new Date(now).toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" });
  const key = new Date(now).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  return { due: day === "Mon" && lastKey !== key, key };
}

export function counts(rows: ConnReportRow[]): { red: number; orange: number; ok: number; total: number } {
  return { red: rows.filter((r) => r.level === "red").length, orange: rows.filter((r) => r.level === "orange").length, ok: rows.filter((r) => r.level === "ok").length, total: rows.length };
}
