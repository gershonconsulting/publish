/**
 * v0.28.0 — a post the team deletes leaves its day empty ON PURPOSE.
 *
 * Olivier, 2026-11-25 (Altavia): "Il faudrait que le système arrête de créer des posts
 * quand on les supprime … on en supprime car certains sont à des dates où c'est férié.
 * Mais le lendemain, il rajoute à nouveau pour cette date."
 *
 * Autopilot and "Fill the gap" filled every empty working day, so a deleted post
 * came back the next morning. Now deleting a planned post records its day
 * (New York date) as "kept empty" for that company; Autopilot and Fill the gap
 * skip those days. Pure (no DB) — tested in tests/skip-days.test.mts.
 */

const YMD = /^\d{4}-\d{2}-\d{2}$/;
/** Days kept: a little history (60 days back) and at most 400 entries. */
const KEEP_BACK_DAYS = 60;
const MAX = 400;

export function skipKey(clientId: string): string {
  return `skip_days:${clientId}`;
}

export function parseSkipDays(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((d): d is string => typeof d === "string" && YMD.test(d)) : [];
  } catch {
    return [];
  }
}

/** Add days (deduped, sorted), drop the ones older than 60 days before `today`. */
export function addSkipDays(current: string[], add: string[], today: string): string[] {
  const floor = new Date(Date.parse(`${today}T12:00:00Z`) - KEEP_BACK_DAYS * 86400000).toISOString().slice(0, 10);
  const set = new Set([...current, ...add].filter((d) => YMD.test(d) && d >= floor));
  return Array.from(set).sort().slice(-MAX);
}

export function removeSkipDays(current: string[], remove: string[]): string[] {
  const r = new Set(remove);
  return current.filter((d) => !r.has(d));
}
