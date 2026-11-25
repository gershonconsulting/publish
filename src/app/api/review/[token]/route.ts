export const runtime = "edge";
/**
 * /api/review/:token — the client's review portal (v4.37.0). No account:
 * the private link IS the access, scoped to one client of one workspace.
 * Rotating the link in Publishing → Accounts revokes it.
 *
 * GET  → { client, items: posts waiting for review + recent history, with threads }
 * POST { contentId, action: "comment" | "request_changes" | "approve", name?, body? }
 *      → comment / request_changes also write a new version of the post from
 *        the text (v4.55.0); the answer carries { revised }.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db-raw";
import type { Prisma } from "@prisma/client";
import { resolveReviewToken } from "@/lib/publishing";
import { clientAction, type ClientAction } from "@/lib/publishing-review";
import { clientVisibleEvents } from "@/lib/review-thread";
import { choicesFor } from "@/lib/picture-choices";

const ITEM_SELECT = {
  id: true, title: true, text: true, textX: true, platforms: true, status: true, scheduledAt: true, version: true,
  approvedAt: true, approvedBy: true, updatedAt: true,
  comments: {
    where: { kind: { in: ["comment", "submitted", "changes_requested", "approved", "edited", "revised", "published"] } },
    select: { id: true, authorName: true, authorRole: true, kind: true, body: true, version: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  },
  deliveries: { select: { platform: true, status: true, postUrl: true, postedAt: true } },
  media: { select: { id: true, key: true, position: true, width: true, height: true }, orderBy: { position: "asc" } },
} satisfies Prisma.ContentItemSelect;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await resolveReviewToken(token);
  if (!r) return NextResponse.json({ success: false, error: "This review link is not valid any more." }, { status: 404 });
  const [client, org, waiting, history] = await Promise.all([
    prisma.client.findFirst({ where: { id: r.clientId }, select: { name: true, logoUrl: true } }),
    prisma.organization.findUnique({ where: { id: r.orgId }, select: { name: true } }),
    // v0.25.1: waiting posts and history are read separately — with one "take 100" ordered by
    // date, a company with a long history could lose the batch the email was about.
    prisma.contentItem.findMany({
      where: { organizationId: r.orgId, clientId: r.clientId, status: { in: ["IN_REVIEW", "CHANGES_REQUESTED"] } },
      select: ITEM_SELECT,
      orderBy: [{ scheduledAt: "asc" }, { updatedAt: "desc" }],
      take: 300,
    }),
    prisma.contentItem.findMany({
      where: {
        organizationId: r.orgId,
        clientId: r.clientId,
        status: { in: ["APPROVED", "SCHEDULED", "PUBLISHED", "PARTIAL"] },
        updatedAt: { gt: new Date(Date.now() - 60 * 86400000) },
      },
      select: ITEM_SELECT,
      orderBy: [{ scheduledAt: "asc" }, { updatedAt: "desc" }],
      take: 100,
    }),
  ]);
  const items = [...waiting, ...history];
  // v0.16.2: the previous comment exchange is internal — never sent to the reviewer.
  // v0.27.0: pictures the client chooses from (waiting posts only; bytes served by …/picture/<post>/<id>).
  const choices = await choicesFor(r.orgId, waiting.map((w) => w.id));
  const visible = items.map((i) => ({
    ...i,
    comments: clientVisibleEvents(i.comments),
    pictureChoices: (choices[i.id] || []).map((c) => ({ id: c.id, width: c.width, height: c.height, url: `/api/review/${token}/picture/${i.id}/${c.id}` })),
  }));
  return NextResponse.json({ success: true, data: { client: client?.name || "", logoUrl: client?.logoUrl || null, agency: org?.name || "", items: visible } });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await resolveReviewToken(token);
  if (!r) return NextResponse.json({ success: false, error: "This review link is not valid any more." }, { status: 404 });
  const b = (await req.json().catch(() => null)) as { contentId?: string; action?: string; name?: string; body?: string; ids?: unknown } | null;
  const action = b?.action as ClientAction;
  if (!["comment", "request_changes", "approve", "approve_all", "choose_picture"].includes(action) || (action !== "approve_all" && !b?.contentId)) {
    return NextResponse.json({ success: false, error: "Bad request" }, { status: 400 });
  }
  const out: { revised?: import("@/lib/publishing-revise").ReviseResult; note?: string | null } = {};
  // v0.25.1: "Approve all" on a focused link approves only the posts shown (ids).
  const ids = Array.isArray(b?.ids) ? (b!.ids as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 300) : null;
  const err = await clientAction(r.orgId, r.clientId, b?.contentId || "", action, b?.name ?? null, b?.body ?? null, out, ids);
  if (err) return NextResponse.json({ success: false, error: err }, { status: 400 });
  return NextResponse.json({ success: true, revised: out.revised ?? null, note: out.note ?? null });
}
