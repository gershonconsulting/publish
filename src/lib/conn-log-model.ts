/**
 * v0.20.0 — connection history per company (Olivier 2026-11-17: "I don't know
 * when these pages were disconnected. We need a log in connections per client").
 *
 * Pure logic (tested in tests/conn-log.test.mts). Every change to a company's
 * direct connections (LinkedIn page, personal LinkedIn profile, X) becomes a
 * dated event. Expiry happens without anyone saving anything, so `reconcile`
 * compares the current state with the last state the log knows and writes the
 * missing event, dated at the real expiry time.
 *
 * No tokens are ever copied into the log — only names, dates and reasons.
 */

export type LogNet = "linkedin" | "x";
export type ConnStatus = "connected" | "error" | "expired" | "none";
export type ConnKind = "connected" | "reconnected" | "disconnected" | "error" | "recovered" | "expired" | "renewed" | "changed" | "seen";

export type ConnEvent = {
  at: string;
  net: LogNet;
  kind: ConnKind;
  /** Page / profile / @handle the connection posts as, when known. */
  as: string | null;
  personal?: boolean;
  detail?: string | null;
  /** Who did it: a team member, "the person (connect link)", "system". */
  by?: string | null;
  /** true when rebuilt from data that existed before the log started. */
  inferred?: boolean;
};

export type NetState = { status: ConnStatus; as: string | null; personal: boolean; error: string | null; expiry: string | null; connectedAt: string | null };

type LiLike = {
  expiresAt: string; refreshToken: string | null; refreshExpiresAt: string | null; connectedAt: string; connectedBy?: string | null;
  lastError: string | null; author: string | null; authors: { urn: string; name: string; vanity: string | null; kind: string }[];
  personal?: boolean; vanity?: string | null;
} | null | undefined;
type XLike = { expiresAt: string; refreshToken: string | null; connectedAt: string; connectedBy?: string | null; lastError: string | null; username: string } | null | undefined;
export type LinkedLike = { linkedin?: LiLike; x?: XLike };

export const MAX_EVENTS = 300;

function liAs(c: NonNullable<LiLike>): string | null {
  const a = c.authors.find((x) => x.urn === c.author);
  if (!a) return c.personal ? c.authors[0]?.name ?? null : null;
  return c.personal || a.kind === "person" ? `${a.name}${(c.vanity || a.vanity) ? ` (in/${c.vanity || a.vanity})` : ""}` : a.name;
}

export function liExpiry(c: NonNullable<LiLike>): string {
  return c.refreshToken && c.refreshExpiresAt ? c.refreshExpiresAt : c.expiresAt;
}

/** State of one network right now. X refreshes itself every 2 hours, so only a missing refresh token makes it expire. */
export function netState(l: LinkedLike, net: LogNet, now = Date.now()): NetState {
  if (net === "linkedin") {
    const c = l.linkedin;
    if (!c) return { status: "none", as: null, personal: false, error: null, expiry: null, connectedAt: null };
    const exp = liExpiry(c);
    const t = Date.parse(exp);
    const status: ConnStatus = Number.isFinite(t) && t <= now ? "expired" : c.lastError ? "error" : "connected";
    return { status, as: liAs(c), personal: !!c.personal, error: c.lastError, expiry: exp, connectedAt: c.connectedAt };
  }
  const x = l.x;
  if (!x) return { status: "none", as: null, personal: false, error: null, expiry: null, connectedAt: null };
  const t = Date.parse(x.expiresAt);
  const expired = !x.refreshToken && Number.isFinite(t) && t <= now;
  return { status: expired ? "expired" : x.lastError ? "error" : "connected", as: `@${x.username}`, personal: false, error: x.lastError, expiry: x.refreshToken ? null : x.expiresAt, connectedAt: x.connectedAt };
}

/** Events between two saved versions of a company's connections. */
export function diffLinked(prev: LinkedLike, next: LinkedLike, at: string, by: string | null, now = Date.parse(at)): ConnEvent[] {
  const out: ConnEvent[] = [];
  for (const net of ["linkedin", "x"] as LogNet[]) {
    const a = netState(prev, net, now);
    const b = netState(next, net, now);
    const ev = (kind: ConnKind, detail: string | null = null, when = at, who: string | null = by): ConnEvent => ({ at: when, net, kind, as: b.as ?? a.as, personal: b.personal || a.personal, detail, by: who });
    if (a.status === "none" && b.status !== "none") { out.push(ev("connected", b.expiry ? `Valid until ${b.expiry.slice(0, 10)}` : null)); continue; }
    if (a.status !== "none" && b.status === "none") { out.push({ ...ev("disconnected", "Removed from Publish"), as: a.as }); continue; }
    if (a.status === "none") continue;
    const newLogin = !!b.connectedAt && b.connectedAt !== a.connectedAt;
    if (newLogin) {
      out.push(ev("reconnected", [a.as !== b.as && a.as ? `was ${a.as}` : null, b.expiry ? `valid until ${b.expiry.slice(0, 10)}` : null].filter(Boolean).join(" · ") || null));
      continue;
    }
    if (a.as !== b.as) out.push(ev("changed", a.as ? `Now posts as ${b.as ?? "nothing"} (was ${a.as})` : null));
    if (b.status === "error" && (a.status !== "error" || a.error !== b.error)) out.push(ev("error", b.error, at, "system"));
    else if (a.status === "error" && b.status === "connected") out.push(ev("recovered", "Posting through the connection works again", at, "system"));
    else if (b.status === "expired" && a.status !== "expired") out.push(ev("expired", "LinkedIn/X needs a new Allow", b.expiry || at, "system"));
    else if (b.status === "connected" && a.expiry && b.expiry && b.expiry > a.expiry && a.status === "connected" && Date.parse(b.expiry) - Date.parse(a.expiry) > 7 * 86400000) {
      out.push(ev("renewed", `Extended to ${b.expiry.slice(0, 10)}`, at, "system"));
    }
  }
  return out;
}

/** Last state the log knows for a network ("none" if never seen). */
export function loggedStatus(events: ConnEvent[], net: LogNet): ConnStatus {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.net !== net) continue;
    if (e.kind === "disconnected") return "none";
    if (e.kind === "expired") return "expired";
    if (e.kind === "error") return "error";
    if (e.kind === "seen" && e.detail === "Not connected") return "none";
    return "connected";
  }
  return "none";
}

/**
 * Events the log is missing compared with the state right now (expiry, or a
 * company the log has never seen). The first time a company is logged, its
 * current connections are written with the date LinkedIn/X gave them (inferred).
 */
export function reconcile(events: ConnEvent[], cur: LinkedLike, now = Date.now()): ConnEvent[] {
  const out: ConnEvent[] = [];
  const iso = new Date(now).toISOString();
  for (const net of ["linkedin", "x"] as LogNet[]) {
    const s = netState(cur, net, now);
    const known = events.some((e) => e.net === net);
    const was = loggedStatus(events, net);
    if (!known) {
      if (s.status === "none") { out.push({ at: iso, net, kind: "seen", as: null, detail: "Not connected", by: "system", inferred: true }); continue; }
      out.push({ at: s.connectedAt || iso, net, kind: "connected", as: s.as, personal: s.personal, detail: "Date taken from the connection itself (before the log started)", by: null, inferred: true });
      if (s.status === "expired") out.push({ at: s.expiry || iso, net, kind: "expired", as: s.as, personal: s.personal, detail: "LinkedIn/X needs a new Allow", by: "system", inferred: true });
      else if (s.status === "error") out.push({ at: iso, net, kind: "error", as: s.as, personal: s.personal, detail: s.error, by: "system", inferred: true });
      continue;
    }
    if (was === s.status) continue;
    if (s.status === "expired") out.push({ at: s.expiry || iso, net, kind: "expired", as: s.as, personal: s.personal, detail: "LinkedIn/X needs a new Allow", by: "system" });
    else if (s.status === "none") out.push({ at: iso, net, kind: "disconnected", as: null, detail: "Connection no longer found", by: "system" });
    else if (s.status === "error") out.push({ at: iso, net, kind: "error", as: s.as, personal: s.personal, detail: s.error, by: "system" });
    else if (was === "none" || was === "expired") out.push({ at: s.connectedAt || iso, net, kind: "connected", as: s.as, personal: s.personal, by: null });
    else out.push({ at: iso, net, kind: "recovered", as: s.as, personal: s.personal, by: "system" });
  }
  return out;
}

/** Append, keep chronological order and the newest MAX_EVENTS. */
export function appendEvents(log: ConnEvent[], add: ConnEvent[]): ConnEvent[] {
  if (!add.length) return log;
  return [...log, ...add].sort((a, b) => a.at.localeCompare(b.at)).slice(-MAX_EVENTS);
}

/** Plain-words line for the screen. */
export function describe(e: ConnEvent): string {
  const what = e.net === "x" ? "X" : e.personal ? "Personal LinkedIn" : "LinkedIn page";
  const as = e.as ? ` — ${e.as}` : "";
  const label: Record<ConnKind, string> = {
    connected: "connected", reconnected: "reconnected (new Allow)", disconnected: "disconnected", error: "stopped working",
    recovered: "working again", expired: "expired", renewed: "renewed automatically", changed: "now posts somewhere else", seen: "not connected (log started)",
  };
  return `${what} ${label[e.kind]}${as}`;
}
