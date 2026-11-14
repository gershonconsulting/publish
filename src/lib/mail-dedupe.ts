/**
 * v0.18.2 — no more email floods from Publish (pure logic, unit-tested in
 * tests/mail-dedupe.test.mts; the database side is lib/mail-burst.ts).
 *
 * Resend audit 2026-11-10 (Altavia reviewing its November posts):
 *   [PUB-202] x5 19:51:45 → 19:52:58Z, [PUB-204] x4 19:50:23 → 19:52:35Z,
 *   [PUB-101] x3 14:23:06 → 14:25:14Z after [PUB-102] x2 14:17 + 14:22Z,
 *   [PUB-214] x3 19:44 → 19:48Z.
 * Each of those emails was about a DIFFERENT post / comment / section — no
 * email was delivered twice. The cause is the design: one email per click
 * (approve one post, ask changes on one post, send one post back for review,
 * one Knowledge section), with no idempotency key and no grouping, so a client
 * working through a batch produced one email every few seconds.
 *
 * Two guards:
 *  1. A deterministic Resend Idempotency-Key per (email number, New York day,
 *     event) — the same event (same post + version, same comment, same
 *     recipient) is delivered at most once in 24 h, whatever retries,
 *     double-clicks, concurrent requests or the Social deployment do.
 *  2. A burst window per (email, company): the first email goes out at once;
 *     further ones of the same kind for that company within BURST_WINDOW_MS are
 *     held (one org_settings row each — no read-modify-write, no migration) and
 *     sent as ONE combined email by the next sweep once the window is over.
 */
import { nyDay } from "@/lib/sweep-digest";

/** 10 minutes: Altavia's bursts lasted 2-8 minutes. */
export const BURST_WINDOW_MS = 10 * 60 * 1000;

/** Emails that are grouped when they come in a burst for one company. */
export const BURST_MAILS = ["REVIEW_ONE", "READY_FOR_PUBLISHING", "CLIENT_CHANGES", "KB_VALIDATION"] as const;
export type BurstMail = (typeof BURST_MAILS)[number];

/** PUB-101 and PUB-102 share one window: both land in the client's inbox. */
export function burstGroup(mail: string): string {
  return mail === "REVIEW_ONE" || mail === "REVIEW_BATCH" ? "client_review" : mail;
}

/** 64-bit FNV-1a, hex. Deterministic and dependency-free (edge runtime). */
export function stableHash(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/**
 * Resend Idempotency-Key: "pub202-2026-11-10-<hash of the event>".
 * `parts` identify the event (org, company, post ids + versions, comment, recipient).
 * Order of parts matters; pass id lists sorted (see sortedIds).
 */
export function mailIdempotencyKey(no: string, now: number, parts: Array<string | number | null | undefined>): string {
  const event = parts.map((p) => (p == null ? "" : String(p).trim().toLowerCase())).join("|");
  return `${no.toLowerCase().replace(/[^a-z0-9]/g, "")}-${nyDay(now)}-${stableHash(event)}`;
}

export function sortedIds(ids: Array<string | null | undefined>): string {
  return Array.from(new Set(ids.filter((x): x is string => !!x))).sort().join(",");
}

/** True when an email of this group went to this company less than the window ago → hold this one. */
export function burstHeld(lastSentMs: number | null, now: number, windowMs = BURST_WINDOW_MS): boolean {
  return lastSentMs != null && Number.isFinite(lastSentMs) && now >= lastSentMs && now - lastSentMs < windowMs;
}

/** True when held emails may now go out as one (the window since the last email is over). */
export function flushDue(lastSentMs: number | null, now: number, windowMs = BURST_WINDOW_MS): boolean {
  return !burstHeld(lastSentMs, now, windowMs);
}

/**
 * v0.18.4 — Resend 2026-11-12, Amphasys: PUB-202 went out 5 times in 67 minutes
 * (12:42 1 post, 13:19 1, 13:29 5, 13:39 5, 13:49 1) while Olivier validated 13
 * posts one by one. No post was listed twice: the window above was a ROLLING
 * rate limit — a held group was flushed as soon as 10 min had passed since the
 * last email, even while approvals were still coming in, so a long session gave
 * one email every 10 minutes. Now a held group waits until the burst is over:
 * nothing new for QUIET_MS (capped at MAX_HOLD_MS after its oldest event).
 */
export const QUIET_MS = BURST_WINDOW_MS;
export const MAX_HOLD_MS = 60 * 60 * 1000;

/** True when no event was added to this held group for quietMs, or its oldest one waited maxMs. */
export function burstQuiet(group: Array<{ at: number }>, now: number, quietMs = QUIET_MS, maxMs = MAX_HOLD_MS): boolean {
  if (!group.length) return true;
  const ats = group.map((e) => (Number.isFinite(e.at) ? e.at : 0));
  return now - Math.max(...ats) >= quietMs || now - Math.min(...ats) >= maxMs;
}

/** A held group goes out once the window since the last email is over AND the burst has gone quiet. */
export function groupDue(group: Array<{ at: number }>, lastSentMs: number | null, now: number): boolean {
  return flushDue(lastSentMs, now) && burstQuiet(group, now);
}

/**
 * v0.18.4 — PUB-202 (internal) for ONE post validated on its own is always held,
 * even the first: validations come in series, and a few minutes' delay on an
 * internal notice costs nothing. Batches ("Approve all", Autopilot) and other
 * emails keep "first one at once".
 */
export function holdOnArrival(mail: string, postCount: number, lastSentMs: number | null, now: number): boolean {
  if (mail === "READY_FOR_PUBLISHING" && postCount === 1) return true;
  return burstHeld(lastSentMs, now);
}

/** One held email, stored as JSON in org_settings `mailq:<group>:<clientId>:<eventId>`. */
export type HeldEvent = {
  id: string;
  at: number;
  mail: BurstMail;
  clientId: string;
  to: string;
  audience: "client" | "internal";
  /** Subject of a single email. */
  subject: string;
  /** Subject when several are combined; "{n}" is replaced by the count. */
  subjectMany: string;
  /** Shown once at the top of a combined email (e.g. "Hi Alexandre,"). */
  intro?: string;
  html: string;
  cta: { href: string; label: string };
  itemIds?: string[];
  who?: string;
};

export const HELD_PREFIX = "mailq:";
export const LAST_PREFIX = "mailq_last:";

export function heldKey(mail: string, clientId: string, eventId: string): string {
  return `${HELD_PREFIX}${burstGroup(mail)}:${clientId}:${eventId}`;
}
export function lastSentKey(mail: string, clientId: string): string {
  return `${LAST_PREFIX}${burstGroup(mail)}:${clientId}`;
}

export function parseHeld(value: string | null | undefined): HeldEvent | null {
  if (!value) return null;
  try {
    const v = JSON.parse(value) as HeldEvent;
    return v && typeof v.id === "string" && typeof v.html === "string" && typeof v.to === "string" ? v : null;
  } catch {
    return null;
  }
}

/** Groups held events by (group, company, recipient), oldest first. */
export function groupHeld(events: HeldEvent[]): HeldEvent[][] {
  const m = new Map<string, HeldEvent[]>();
  for (const e of [...events].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))) {
    const k = `${burstGroup(e.mail)}|${e.clientId}|${e.to.toLowerCase()}`;
    m.set(k, [...(m.get(k) || []), e]);
  }
  return Array.from(m.values());
}

/** One email out of several held ones. A single held event goes out as it was written. */
export function combineHeld(events: HeldEvent[]): { subject: string; html: string; mail: string; idParts: string } {
  const first = events[0];
  const n = events.length;
  const idParts = sortedIds(events.map((e) => e.id));
  if (n === 1) return { subject: first.subject, html: `${first.intro || ""}${first.html}`, mail: first.mail, idParts };
  const sep = `<hr style="border:none;border-top:1px solid #eee;margin:16px 0">`;
  return {
    subject: first.subjectMany.replace("{n}", String(n)),
    html: `${first.intro || ""}${events.map((e) => e.html).join(sep)}`,
    // Several posts to review in one email is a batch (PUB-102).
    mail: first.mail === "REVIEW_ONE" ? "REVIEW_BATCH" : first.mail,
    idParts,
  };
}
