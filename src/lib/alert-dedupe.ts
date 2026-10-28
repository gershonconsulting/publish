/**
 * v0.6.1 — report emails that are useful, not noise.
 *
 *  1. "Post did not go out" alerts: once per post, grouped into ONE email per
 *     sweep. A post is identified by company-item + network + destination (NOT
 *     by delivery id: rescheduling deletes and recreates deliveries, which
 *     used to make the same post alert again every day). It alerts again only
 *     if it fails again after a Retry (new scheduled time) or after 7 days.
 *  2. "Under half a week" in the daily content emails: shown in full only when
 *     the set of companies changed since the last email, otherwise one line.
 *
 * Pure functions + a tiny store interface so the logic is unit-testable.
 * The real store is the existing `org_settings` table (OrgSetting) — no new
 * table, no migration. Keys: `post_alert_ledger`, `content_critical_sig:<kind>`.
 */

export const REALERT_AFTER_MS = 7 * 86400000;

export type AlertStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
};

export type FailedPost = {
  id: string;
  contentId: string | null;
  platform: string;
  target: string | null;
  /** Scheduled time (ms). A Retry resets it to "now", which marks a new run. */
  scheduledAtMs: number;
};

type Ledger = Record<string, { at: number; run: number }>;

export const LEDGER_KEY = "post_alert_ledger";

export function postKey(p: FailedPost): string {
  return `${p.contentId || p.id}|${p.platform}|${(p.target || "").toLowerCase()}`;
}

async function readLedger(store: AlertStore): Promise<Ledger> {
  try {
    const raw = await store.get(LEDGER_KEY);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" ? (v as Ledger) : {};
  } catch {
    return {};
  }
}

/** Posts that have not been alerted for this run yet (pure; no writes). */
export function pickNew(ledger: Ledger, posts: FailedPost[], now: number): FailedPost[] {
  const seen = new Set<string>();
  return posts.filter((p) => {
    const k = postKey(p);
    if (seen.has(k)) return false;
    seen.add(k);
    const prev = ledger[k];
    return !prev || prev.run !== p.scheduledAtMs || now - prev.at > REALERT_AFTER_MS;
  });
}

/** Which of these failures still need an alert? Call `markAlerted` after the email went out. */
export async function newFailures(store: AlertStore, posts: FailedPost[], now = Date.now()): Promise<FailedPost[]> {
  if (!posts.length) return [];
  return pickNew(await readLedger(store), posts, now);
}

export async function markAlerted(store: AlertStore, posts: FailedPost[], now = Date.now()): Promise<void> {
  if (!posts.length) return;
  const ledger = await readLedger(store);
  for (const p of posts) ledger[postKey(p)] = { at: now, run: p.scheduledAtMs };
  for (const k of Object.keys(ledger)) if (now - ledger[k].at > 3 * REALERT_AFTER_MS) delete ledger[k]; // keep it small
  await store.set(LEDGER_KEY, JSON.stringify(ledger));
}

// ── "Under half a week" ──────────────────────────────────────────────────────

export function criticalSig(ids: string[]): string {
  return [...new Set(ids)].sort().join(",");
}

/** True when the set of critical companies equals what the previous email showed. */
export async function criticalUnchanged(store: AlertStore, scope: string, ids: string[]): Promise<boolean> {
  if (!ids.length) return false;
  try {
    return (await store.get(`content_critical_sig:${scope}`)) === criticalSig(ids);
  } catch {
    return false;
  }
}

export async function saveCritical(store: AlertStore, scope: string, ids: string[]): Promise<void> {
  try {
    await store.set(`content_critical_sig:${scope}`, criticalSig(ids));
  } catch { /* losing it only means one extra full email */ }
}

export function noChangeLine(count: number): string {
  return `No change since yesterday (${count} ${count === 1 ? "company" : "companies"} under half a week)`;
}
