/**
 * v0.7.5 — ONE internal email per sweep run (PUB-212).
 * v0.11.3 — and at most ONE PUB-212 per New York day (see the bottom of this file).
 *
 * Audit 2026-10-23 → 10-27: every day at 15:30Z the team got four near-identical
 * "[PUB-205/207/209] A X post did not go out" emails (one per company —
 * PuenteLatin, LINALYSIS, Gershon Consulting, AmericanAbroad: the publishing
 * Chrome is only signed in to X as @oattia), plus separate PUB-207 failures and
 * four "LinkedIn signed out" alerts. Now a sweep collects everything that did
 * not go out — missed (PUB-205), stuck (PUB-206), failed in the Chrome
 * extension (PUB-207) or through a connected account (PUB-208) — and every
 * network sign-out (PUB-209) into one table: company, network, reason, direct
 * link. Each post is still reported once (alert-dedupe.ts ledger).
 *
 * Also: the daily content inventory (PUB-201) is sent only when its state
 * changed since the last one sent (`inventorySig`, key `content_inventory_sig:<scope>`
 * in the existing org_settings table — no migration).
 *
 * Pure functions only, so they are unit-testable (tests/sweep-digest.test.mts).
 */
import type { AlertStore } from "@/lib/alert-dedupe"; // type-only: erased at runtime

export type DigestKind = "missed" | "stuck" | "failed" | "signed_out";

export type DigestEntry = {
  kind: DigestKind;
  /** Company name(s); for a sign-out of the shared browser, the companies with posts on hold. */
  company: string;
  /** "X" / "LinkedIn". */
  network: string;
  reason: string;
  /** Direct link into publish.gershon.ai. */
  link: string;
  /** Scheduled time (already formatted) for a post; sign-out time for a sign-out. */
  when?: string;
  /** First line of the post, for posts. */
  excerpt?: string;
  /** Scheduled posts waiting, for a sign-out. */
  pending?: number;
};

const KIND_LABEL: Record<DigestKind, string> = {
  missed: "Not published in time",
  stuck: "Started, never reported back",
  failed: "Failed to publish",
  signed_out: "Signed out — posts on hold",
};

function escHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

export function digestSubject(entries: DigestEntry[]): string {
  const posts = entries.filter((e) => e.kind !== "signed_out").length;
  const outs = entries.filter((e) => e.kind === "signed_out");
  const nets = [...new Set(outs.map((e) => e.network))].join(" + ");
  const held = outs.reduce((n, e) => n + (e.pending || 0), 0);
  if (posts) return `${posts} post${posts === 1 ? "" : "s"} did not go out today${outs.length ? ` — ${nets} signed out` : ""}`;
  return `${nets} signed out — ${held} scheduled post${held === 1 ? " is" : "s are"} on hold`;
}

/** Posts first (by company, then network), then sign-outs. */
export function sortEntries(entries: DigestEntry[]): DigestEntry[] {
  const rank = (e: DigestEntry) => (e.kind === "signed_out" ? 1 : 0);
  return [...entries].sort((a, b) => rank(a) - rank(b) || a.company.localeCompare(b.company) || a.network.localeCompare(b.network));
}

export const DIGEST_MAX_ROWS = 60;

export function digestHtml(entries: DigestEntry[]): string {
  const td = "padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top";
  const list = sortEntries(entries);
  const rows = list.slice(0, DIGEST_MAX_ROWS).map((e) => {
    const what = `<b>${escHtml(KIND_LABEL[e.kind])}</b>${e.when ? `<br><span style="color:#666;font-size:12px">${escHtml(e.when)}</span>` : ""}`;
    const detail = [
      e.excerpt ? `<i style="color:#555">“${escHtml(e.excerpt)}”</i>` : "",
      e.pending != null ? `${e.pending} scheduled post${e.pending === 1 ? "" : "s"} waiting` : "",
      escHtml(e.reason),
    ].filter(Boolean).join("<br>");
    return `<tr><td style="${td}"><b>${escHtml(e.company)}</b></td><td style="${td}">${escHtml(e.network)}</td><td style="${td}">${what}</td>
      <td style="${td}">${detail}</td><td style="${td};white-space:nowrap"><a href="${escHtml(e.link)}" style="color:#d11200;font-weight:bold;text-decoration:none">Open →</a></td></tr>`;
  });
  const th = "text-align:left;padding:6px 8px;border-bottom:2px solid #ddd;font-size:12px;color:#555";
  const posts = list.filter((e) => e.kind !== "signed_out").length;
  const outs = list.length - posts;
  return `<p>${posts ? `<b>${posts} post${posts === 1 ? "" : "s"} did not go out</b>` : "Nothing failed"}${outs ? `, and <b>${outs} publishing sign-in${outs === 1 ? "" : "s"}</b> need${outs === 1 ? "s" : ""} attention` : ""}:</p>
    <table style="border-collapse:collapse;font-size:13px"><tr><th style="${th}">Company</th><th style="${th}">Network</th><th style="${th}">What happened</th><th style="${th}">Reason</th><th style="${th}"></th></tr>${rows.join("")}</table>
    ${list.length > DIGEST_MAX_ROWS ? `<p>…and ${list.length - DIGEST_MAX_ROWS} more in the calendar.</p>` : ""}
    <p style="color:#666;font-size:12px">One email a day at most (first check from ${DIGEST_SEND_HOUR_NY}:00 New York time). Anything that fails after it is in tomorrow's email; the calendar always shows it right away. Each post is reported once — again only if it fails again after a Retry, or after 7 days. A sign-out is reported once per sign-out.</p>`;
}

// ── Content inventory (PUB-201): send only on change ─────────────────────────

export type InventoryState = { clientId: string; level: string; overdueReviews?: number; overdueChanges?: number };

/**
 * The state the team acts on: which companies need attention and how
 * (level + overdue flags). Exact post counts are left out on purpose — they
 * move every day as posts go out, which is what made the same alert repeat.
 */
export function inventorySig(rows: InventoryState[]): string {
  return rows
    .map((r) => `${r.clientId}:${r.level}:${r.overdueReviews ? "R" : ""}${r.overdueChanges ? "C" : ""}`)
    .sort()
    .join(",");
}

export const INVENTORY_SIG_KEY = (scope: string) => `content_inventory_sig:${scope}`;

/** True when the inventory state differs from the last one SENT (or nothing was sent yet). */
export async function inventoryChanged(store: AlertStore, scope: string, sig: string): Promise<boolean> {
  try {
    return (await store.get(INVENTORY_SIG_KEY(scope))) !== sig;
  } catch {
    return true; // cannot tell: send rather than go silent
  }
}

export async function saveInventorySig(store: AlertStore, scope: string, sig: string): Promise<void> {
  try {
    await store.set(INVENTORY_SIG_KEY(scope), sig);
  } catch { /* worst case: one extra email */ }
}

// ── PUB-205 (browser offline): at most one email per UTC day (v0.7.6) ────────
// Superseded in sweep() by the whole-digest daily guard below (v0.11.3); kept
// for its tests and for any caller still importing it.

export const OFFLINE_DAY_KEY = "pub205_digest_day";

export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * Posts that missed their window because the publishing browser was offline
 * ("missed", PUB-205) are reported in at most ONE digest per UTC day. Later
 * misses the same day are held (not marked in the ledger) and go into the next
 * day's digest. Failures, stuck posts and sign-outs are not held: they are
 * different causes, each already reported once.
 */
export function applyOfflineDailyCap<T extends { kind: DigestKind }>(rows: T[], lastDay: string | null, now: number): { send: T[]; held: T[] } {
  if (lastDay !== utcDay(now)) return { send: rows, held: [] };
  return { send: rows.filter((r) => r.kind !== "missed"), held: rows.filter((r) => r.kind === "missed") };
}

export async function lastOfflineDigestDay(store: AlertStore): Promise<string | null> {
  try { return await store.get(OFFLINE_DAY_KEY); } catch { return null; } // cannot tell: allow the send
}

export async function saveOfflineDigestDay(store: AlertStore, now: number): Promise<void> {
  try { await store.set(OFFLINE_DAY_KEY, utcDay(now)); } catch { /* worst case: one extra email */ }
}

// ── PUB-212: at most ONE digest per New York day (v0.11.3) ───────────────────
//
// Resend audit 2026-10-31 → 11-06: the "[PUB-212] N posts did not go out today"
// email still came 2-3 times a day (≈14:32Z, ≈16:30Z and 00:00Z), sometimes
// twice a minute apart (11-01 14:32 + 14:33, 11-03 14:31 + 14:32). Causes:
//  - sweep() runs every minute (extension), on page load and every 15 min
//    (cron), and sent one digest per run with anything NEW since the last one —
//    so a 9:30 miss and an 11:30 extension failure were two emails;
//  - the v0.7.6 cap held only "missed" rows and reset at 00:00 UTC (19:00/20:00
//    New York), which released the held rows as a third email every evening;
//  - two sweeps running at the same moment both read "nothing sent yet".
// Now the whole digest (all kinds + sign-outs) goes out at most once per New
// York day, from the first sweep at or after DIGEST_SEND_HOUR_NY that has
// something to report; later rows wait (not marked in the ledger) for the next
// day's digest. The Resend Idempotency-Key "pub212-<day>-<org>-<recipient>"
// stops two concurrent sweeps from both sending.

export const DIGEST_DAY_KEY = "pub212_digest_day";
/** 10:00 New York: after the usual 9:30 slot and its grace period. */
export const DIGEST_SEND_HOUR_NY = 10;
const NY = "America/New_York";

/** "2026-11-05" — the New York calendar day of `now`. */
export function nyDay(now: number): string {
  return new Date(now).toLocaleDateString("en-CA", { timeZone: NY });
}

/** 0-23, New York wall-clock hour of `now`. */
export function nyHour(now: number): number {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: NY, hour: "2-digit", hourCycle: "h23" }).format(new Date(now)));
  return h === 24 ? 0 : h;
}

/** True when this sweep may send today's PUB-212 (none sent yet today, and it is past the send hour). */
export function digestDue(lastDay: string | null, now: number): boolean {
  return lastDay !== nyDay(now) && nyHour(now) >= DIGEST_SEND_HOUR_NY;
}

/** Resend Idempotency-Key: the same key within 24 h sends only once. */
export function digestIdempotencyKey(orgId: string, to: string | null, now: number): string {
  return `pub212-${nyDay(now)}-${orgId}-${(to || "team").toLowerCase()}`.slice(0, 256);
}

export async function lastDigestDay(store: AlertStore): Promise<string | null> {
  try { return await store.get(DIGEST_DAY_KEY); } catch { return null; } // cannot tell: the idempotency key still caps it
}

export async function saveDigestDay(store: AlertStore, now: number): Promise<void> {
  try { await store.set(DIGEST_DAY_KEY, nyDay(now)); } catch { /* the idempotency key still caps it for 24 h */ }
}
