/**
 * House style before Gershon (v0.10.0) — the company's OWN posts, collected by
 * social.gershon.ai, from before Gershon took over its publishing.
 *
 * Takeover date (first one that exists):
 *   1. the date typed on the Knowledge Base page (manual override);
 *   2. otherwise the EARLIEST of: the company's campaign start date, and the
 *      first post Publish (or Social before the split) actually delivered.
 *   No takeover date → Gershon never published for it: every collected post
 *   is the company's own.
 * Posts Gershon delivered are also left out by their LinkedIn/X id and URL,
 * so a post we wrote can never be read as "their" style.
 *
 * Read-only on Social's tables (SocialPost) — the shared Neon DB, no schema change.
 */
import prisma from "@/lib/db-raw";
import { houseStyleStats, type HistoryPost, type HouseStyleStats } from "@/lib/house-style-stats";

export type Takeover = { date: string | null; source: "manual" | "campaign-start" | "first-delivery" | "none" };
export type HouseStyle = { takeover: Takeover; stats: HouseStyleStats; excludedOurs: number; afterTakeover: number };

const MAX_POSTS = 400;

export async function takeoverOf(orgId: string, clientId: string, manual?: string | null): Promise<Takeover> {
  if (manual && /^\d{4}-\d{2}-\d{2}$/.test(manual)) return { date: manual, source: "manual" };
  const [client, first] = await Promise.all([
    prisma.client.findFirst({ where: { id: clientId, organizationId: orgId }, select: { campaignStartDate: true } }),
    prisma.scheduledPost.findFirst({
      where: { clientId, organizationId: orgId, postedAt: { not: null } },
      orderBy: { postedAt: "asc" },
      select: { postedAt: true },
    }),
  ]);
  const camp = client?.campaignStartDate ?? null;
  const deliv = first?.postedAt ?? null;
  if (!camp && !deliv) return { date: null, source: "none" };
  if (camp && (!deliv || camp <= deliv)) return { date: camp.toISOString().slice(0, 10), source: "campaign-start" };
  return { date: deliv!.toISOString().slice(0, 10), source: "first-delivery" };
}

export async function houseStyle(orgId: string, clientId: string, manualTakeover?: string | null): Promise<HouseStyle> {
  const takeover = await takeoverOf(orgId, clientId, manualTakeover);
  const before = takeover.date ? new Date(takeover.date + "T00:00:00Z") : null;

  const [rows, ours, afterTakeover] = await Promise.all([
    prisma.socialPost.findMany({
      where: { clientId, ...(before ? { publishedAtUtc: { lt: before } } : {}) },
      select: { platform: true, externalPostId: true, postUrl: true, postTextFull: true, postTextSnippet: true, hasMedia: true, publishedAtUtc: true, likeCount: true, commentCount: true, shareCount: true },
      orderBy: { publishedAtUtc: "desc" },
      take: MAX_POSTS,
    }),
    prisma.scheduledPost.findMany({
      where: { clientId, organizationId: orgId, OR: [{ externalPostId: { not: null } }, { postUrl: { not: null } }] },
      select: { externalPostId: true, postUrl: true },
      take: 5000,
    }),
    before ? prisma.socialPost.count({ where: { clientId, publishedAtUtc: { gte: before } } }) : Promise.resolve(0),
  ]);

  const ids = new Set(ours.map((o) => o.externalPostId).filter(Boolean) as string[]);
  const urls = new Set(ours.map((o) => normUrl(o.postUrl)).filter(Boolean) as string[]);
  let excludedOurs = 0;
  const posts: HistoryPost[] = [];
  for (const r of rows) {
    if (ids.has(r.externalPostId) || (r.postUrl && urls.has(normUrl(r.postUrl)!))) { excludedOurs++; continue; }
    posts.push({
      platform: r.platform,
      text: (r.postTextFull || r.postTextSnippet || "").replace(/\r\n/g, "\n"),
      publishedAtUtc: r.publishedAtUtc,
      hasMedia: r.hasMedia,
      likes: r.likeCount,
      comments: r.commentCount,
      shares: r.shareCount,
      url: r.postUrl,
    });
  }
  return { takeover, stats: houseStyleStats(posts), excludedOurs, afterTakeover };
}

function normUrl(u: string | null): string | null {
  if (!u) return null;
  return u.trim().toLowerCase().replace(/[?#].*$/, "").replace(/\/+$/, "");
}
