/**
 * Published — daily view (v0.12.0). Pure part: no database, tested in
 * tests/published-day.test.mts.
 *
 * One ET calendar day (business time zone): what went out, for which company,
 * on which network — and what was due that day but did not go out.
 */

export type DayDelivery = {
  id: string;
  clientId: string | null;
  contentId: string | null;
  platform: string;
  target: string | null;
  text: string;
  status: string;
  scheduledAt: string;
  postedAt: string | null;
  postUrl: string | null;
  verifiedAt: string | null;
  lastError: string | null;
  picture: string | null;
};

export type DayCompany = {
  clientId: string;
  company: string;
  clientType: string;
  timezone: string;
  published: DayDelivery[];
  notOut: DayDelivery[];
  pending: DayDelivery[];
};

export type DayView = {
  date: string;
  dateLabel: string;
  generatedAt: string;
  totals: { published: number; companies: number; linkedin: number; x: number; verified: number; notOut: number; pending: number };
  companies: DayCompany[];
  strip: { date: string; published: number; notOut: number }[];
};

export const ISO_DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** "2026-11-04" → "2026-11-03" (n = -1). Calendar arithmetic only. */
export function shiftDay(ds: string, n: number): string {
  const [y, m, d] = ds.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** First picture URL from a ScheduledPost.mediaJson snapshot, if any. */
export function firstPicture(mediaJson: string | null | undefined): string | null {
  if (!mediaJson) return null;
  try {
    const a = JSON.parse(mediaJson);
    if (Array.isArray(a)) for (const m of a) if (m && typeof m.url === "string" && m.url) return m.url;
  } catch {
    /* ignore a bad snapshot */
  }
  return null;
}

/**
 * Group one day's deliveries by company.
 *  published = POSTED with postedAt inside the day
 *  notOut    = FAILED / MISSED scheduled inside the day
 *  pending   = SCHEDULED / POSTING scheduled inside the day (today or later)
 * Companies with nothing on that day are left out. Companies with published
 * posts come first, then by name.
 */
export function groupDay(
  companies: { id: string; name: string; clientType: string; timezone: string }[],
  rows: DayDelivery[],
  from: Date,
  to: Date,
): { companies: DayCompany[]; totals: DayView["totals"] } {
  const inDay = (iso: string | null) => !!iso && Date.parse(iso) >= from.getTime() && Date.parse(iso) < to.getTime();
  const out: DayCompany[] = [];
  for (const c of companies) {
    const mine = rows.filter((r) => r.clientId === c.id);
    const published = mine.filter((r) => r.status === "POSTED" && inDay(r.postedAt)).sort((a, b) => Date.parse(a.postedAt!) - Date.parse(b.postedAt!));
    const notOut = mine.filter((r) => (r.status === "FAILED" || r.status === "MISSED") && inDay(r.scheduledAt)).sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
    const pending = mine.filter((r) => (r.status === "SCHEDULED" || r.status === "POSTING") && inDay(r.scheduledAt)).sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
    if (published.length + notOut.length + pending.length === 0) continue;
    out.push({ clientId: c.id, company: c.name, clientType: c.clientType, timezone: c.timezone, published, notOut, pending });
  }
  out.sort((a, b) => (b.published.length > 0 ? 1 : 0) - (a.published.length > 0 ? 1 : 0) || a.company.localeCompare(b.company));
  const all = out.flatMap((c) => c.published);
  return {
    companies: out,
    totals: {
      published: all.length,
      companies: out.filter((c) => c.published.length > 0).length,
      linkedin: all.filter((r) => r.platform === "LINKEDIN").length,
      x: all.filter((r) => r.platform === "TWITTER").length,
      verified: all.filter((r) => !!r.verifiedAt).length,
      notOut: out.reduce((a, c) => a + c.notOut.length, 0),
      pending: out.reduce((a, c) => a + c.pending.length, 0),
    },
  };
}
