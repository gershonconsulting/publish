/**
 * Published — daily view (v0.12.0). Data part: reads ScheduledPost for one
 * ET day plus a 14-day strip of daily counts. Pure grouping lives in
 * published-day-model.ts.
 */
import prisma from "@/lib/db-raw";
import { BUSINESS_TZ, publishCompanies, zonedMidnight } from "@/lib/publish-dashboard";
import { firstPicture, groupDay, shiftDay, type DayDelivery, type DayView } from "@/lib/published-day-model";

export function todayET(now = Date.now()): string {
  return new Date(now).toLocaleDateString("en-CA", { timeZone: BUSINESS_TZ });
}

export async function publishedDay(orgId: string, opts: { date: string; clientId?: string | null }, now = Date.now()): Promise<DayView> {
  const companies = await publishCompanies(orgId, opts.clientId);
  const ids = companies.map((c) => c.id);
  const from = zonedMidnight(opts.date, BUSINESS_TZ);
  const to = zonedMidnight(shiftDay(opts.date, 1), BUSINESS_TZ);
  const stripFrom = zonedMidnight(shiftDay(opts.date, -13), BUSINESS_TZ);
  const scope = { organizationId: orgId, clientId: { in: ids } };

  const [rows, stripRows] = await Promise.all([
    prisma.scheduledPost.findMany({
      where: { ...scope, OR: [{ postedAt: { gte: from, lt: to } }, { scheduledAt: { gte: from, lt: to } }] },
      select: {
        id: true, clientId: true, contentId: true, platform: true, target: true, text: true, status: true,
        scheduledAt: true, postedAt: true, postUrl: true, verifiedAt: true, lastError: true, mediaJson: true,
      },
      take: 2000,
    }),
    prisma.scheduledPost.findMany({
      where: {
        ...scope,
        OR: [
          { status: "POSTED", postedAt: { gte: stripFrom, lt: to } },
          { status: { in: ["FAILED", "MISSED"] }, scheduledAt: { gte: stripFrom, lt: to } },
        ],
      },
      select: { status: true, postedAt: true, scheduledAt: true },
      take: 20000,
    }),
  ]);

  const deliveries: DayDelivery[] = rows.map((r) => ({
    id: r.id,
    clientId: r.clientId,
    contentId: r.contentId,
    platform: r.platform,
    target: r.target,
    text: r.text,
    status: r.status,
    scheduledAt: r.scheduledAt.toISOString(),
    postedAt: r.postedAt ? r.postedAt.toISOString() : null,
    postUrl: r.postUrl,
    verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
    lastError: r.lastError,
    picture: firstPicture(r.mediaJson),
  }));
  const g = groupDay(companies, deliveries, from, to);

  const key = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: BUSINESS_TZ });
  const strip = Array.from({ length: 14 }, (_, i) => ({ date: shiftDay(opts.date, i - 13), published: 0, notOut: 0 }));
  for (const r of stripRows) {
    const d = r.status === "POSTED" ? r.postedAt : r.scheduledAt;
    if (!d) continue;
    const s = strip.find((x) => x.date === key(d));
    if (!s) continue;
    if (r.status === "POSTED") s.published++;
    else s.notOut++;
  }

  const dateLabel = new Date(from.getTime() + 12 * 3600_000).toLocaleDateString("en-US", {
    timeZone: BUSINESS_TZ, weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
  return { date: opts.date, dateLabel, generatedAt: new Date(now).toISOString(), totals: g.totals, companies: g.companies, strip };
}
