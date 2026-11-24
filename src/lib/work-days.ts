/**
 * v0.22.0 (Olivier, 2026-11-19): "Schedule only during working days — no
 * Saturday and Sunday posts." Pure date helpers, no database.
 * Dates are "YYYY-MM-DD" in New York time (the posting clock of Publish).
 */

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(ymd: string): number {
  return new Date(ymd + "T12:00:00Z").getUTCDay();
}

export function isWeekendYmd(ymd: string): boolean {
  const d = weekdayOf(ymd);
  return d === 0 || d === 6;
}

function plus(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
}

/** The same day when it is Monday–Friday, otherwise the next Monday. */
export function nextWorkday(ymd: string): string {
  let x = ymd;
  while (isWeekendYmd(x)) x = plus(x, 1);
  return x;
}

/**
 * The first Monday–Friday on or after `from` that is not in `taken`
 * (one post per company per day). null if none within `maxDays`.
 */
export function firstFreeWorkday(from: string, taken: Set<string>, maxDays = 21): string | null {
  let x = from;
  for (let i = 0; i < maxDays; i++) {
    if (!isWeekendYmd(x) && !taken.has(x)) return x;
    x = plus(x, 1);
  }
  return null;
}

// ── New York clock ───────────────────────────────────────────────────────────

const TZ = "America/New_York";
const ymdFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const hmFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });

/** "YYYY-MM-DD" of an instant, New York time. */
export function etDay(d: Date): string {
  return ymdFmt.format(d);
}

/** The instant of "YYYY-MM-DD HH:MM" New York time. */
export function etAt(ymd: string, hhmm: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  for (const off of [4, 5]) {
    const t = new Date(Date.UTC(y, m - 1, d, hh + off, mm));
    if (hmFmt.format(t).replace(/^24/, "00") === `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`) return t;
  }
  return new Date(Date.UTC(y, m - 1, d, hh + 5, mm));
}

/** A Saturday/Sunday instant moved to the next Monday at the same New York time; weekdays unchanged. */
export function toWorkday(when: Date): Date {
  const day = etDay(when);
  if (!isWeekendYmd(day)) return when;
  return etAt(nextWorkday(day), hmFmt.format(when).replace(/^24/, "00"));
}

/** v0.23.3: true when the instant falls on a Saturday/Sunday in New York. */
export function isWeekendInstant(when: Date): boolean {
  return isWeekendYmd(etDay(when));
}
