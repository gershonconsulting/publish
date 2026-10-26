/**
 * Content runway — pure date logic, no database (Publish v0.6.0).
 *
 * THREE-PLATFORM-SPLIT.md §14.4: runway is computed against the actual
 * upcoming posting requirement, not by dividing a raw count by a rate.
 *
 *   1. Posting SLOTS: from tomorrow to the end of next month, the weekdays the
 *      company's objective asks for (5/week → Mon–Fri, 3/week → Mon/Wed/Fri…).
 *      The objective is Social's "Campaign posting objectives" setting
 *      (OrgSetting posting_objectives), 5/week by default.
 *   2. SCHEDULED content (status SCHEDULED, then APPROVED items that already
 *      carry a planned date) covers the slot on its own day, or the nearest
 *      free slot in the same week. One item covers ONE slot — never several.
 *   3. APPROVED content without a date fills the earliest free slots.
 *   4. The first free slot is where the runway ends: "N posts needed by <day>".
 *
 * Scheduled coverage and approved (unscheduled) inventory are reported
 * separately, as the spec requires.
 */

export const DAY_MS = 86400000;

/** "YYYY-MM-DD" of an instant in a time zone. */
export function localDate(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function addDays(ds: string, n: number): string {
  const t = Date.parse(ds + "T12:00:00Z") + n * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(ds: string): number {
  return new Date(ds + "T12:00:00Z").getUTCDay();
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / DAY_MS);
}

/** Last day of the month of ds, and of the month after. */
export function monthEnds(ds: string): { endThis: string; endNext: string } {
  const [y, m] = ds.split("-").map(Number);
  const endThis = new Date(Date.UTC(y, m, 0, 12)).toISOString().slice(0, 10);
  const endNext = new Date(Date.UTC(y, m + 1, 0, 12)).toISOString().slice(0, 10);
  return { endThis, endNext };
}

/** Which weekdays carry a post for a posts-per-week objective. */
export function slotWeekdays(perWeek: number): number[] {
  const p = Math.max(1, Math.min(7, Math.round(perWeek)));
  const map: Record<number, number[]> = {
    1: [3],
    2: [2, 4],
    3: [1, 3, 5],
    4: [1, 2, 4, 5],
    5: [1, 2, 3, 4, 5],
    6: [1, 2, 3, 4, 5, 6],
    7: [0, 1, 2, 3, 4, 5, 6],
  };
  return map[p];
}

/** Monday of the week of ds. */
function weekStart(ds: string): string {
  const wd = weekday(ds);
  return addDays(ds, wd === 0 ? -6 : 1 - wd);
}

export type PeriodCover = { required: number; scheduled: number; approved: number; missing: number };

export type Runway = {
  perWeek: number;
  /** First day counted (tomorrow, company local time). */
  from: string;
  thisMonth: PeriodCover;
  nextMonth: PeriodCover;
  /** First posting slot with nothing for it, or null when everything to the end of next month is covered. */
  firstGap: string | null;
  /** Calendar days from today until the first gap (or to the end of next month when there is none). */
  daysCovered: number;
  /** True when there is no gap before the end of next month. */
  coveredToHorizon: boolean;
  /** Free slots in the next 7 days. */
  neededIn7: number;
  /** Approved items with no free slot left (more inventory than slots). */
  surplus: number;
  level: "ok" | "low" | "critical";
};

export function computeRunway(input: {
  today: string;
  perWeek: number;
  /** Local dates of SCHEDULED content items (planned publication day). */
  scheduledDates: string[];
  /** Local dates of APPROVED items that already carry a planned day. */
  approvedDates: string[];
  /** APPROVED items with no planned day (or one in the past). */
  approvedPool: number;
}): Runway {
  const { today } = input;
  const from = addDays(today, 1);
  const { endThis, endNext } = monthEnds(today);
  const days = slotWeekdays(input.perWeek);

  const slots: { date: string; by: "scheduled" | "approved" | null }[] = [];
  for (let d = from; d <= endNext; d = addDays(d, 1)) if (days.includes(weekday(d))) slots.push({ date: d, by: null });

  const place = (date: string, by: "scheduled" | "approved"): boolean => {
    if (date < from || date > endNext) return false;
    const exact = slots.find((s) => s.date === date && !s.by);
    if (exact) { exact.by = by; return true; }
    const ws = weekStart(date);
    const we = addDays(ws, 6);
    const sameWeek = slots.filter((s) => !s.by && s.date >= ws && s.date <= we);
    if (!sameWeek.length) return false;
    // Nearest free slot in the same week, later days first on a tie.
    sameWeek.sort((a, b) => Math.abs(daysBetween(date, a.date)) - Math.abs(daysBetween(date, b.date)) || (a.date < b.date ? 1 : -1));
    sameWeek[0].by = by;
    return true;
  };

  let pool = Math.max(0, input.approvedPool);
  for (const d of [...input.scheduledDates].sort()) place(d, "scheduled");
  for (const d of [...input.approvedDates].sort()) {
    // No slot on or near its planned day: still approved inventory.
    if (!place(d, "approved")) pool++;
  }
  for (const s of slots) {
    if (pool <= 0) break;
    if (!s.by) { s.by = "approved"; pool--; }
  }

  const period = (a: string, b: string): PeriodCover => {
    const ps = slots.filter((s) => s.date >= a && s.date <= b);
    const scheduled = ps.filter((s) => s.by === "scheduled").length;
    const approved = ps.filter((s) => s.by === "approved").length;
    return { required: ps.length, scheduled, approved, missing: ps.length - scheduled - approved };
  };

  const gap = slots.find((s) => !s.by) || null;
  const daysCovered = gap ? daysBetween(today, gap.date) - 1 : daysBetween(today, endNext);
  const in7 = addDays(today, 7);
  const neededIn7 = slots.filter((s) => !s.by && s.date <= in7).length;
  const level: Runway["level"] = daysCovered >= 7 ? "ok" : daysCovered >= 3 ? "low" : "critical";

  return {
    perWeek: input.perWeek,
    from,
    thisMonth: period(from, endThis),
    nextMonth: period(addDays(endThis, 1), endNext),
    firstGap: gap ? gap.date : null,
    daysCovered: Math.max(0, daysCovered),
    coveredToHorizon: !gap,
    neededIn7,
    surplus: pool,
    level,
  };
}

/** "Wednesday" for a date within the next week, else "Wed Nov 4". */
export function dayLabel(ds: string, today: string): string {
  const d = new Date(ds + "T12:00:00Z");
  const diff = daysBetween(today, ds);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff > 1 && diff < 7) return d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
