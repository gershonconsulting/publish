export const runtime = "edge";
/**
 * /api/knowledge-base/<clientId>/validation (v0.16.0) — the team's view of
 * Knowledge validation for one company.
 *   GET  → { releasedAt, internal: { url, summary }, client: { url, summary, open }, sections }
 *   POST { rotate: "internal" | "client" } → new private link (the old one stops working).
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db-raw";
import { publishingCaller } from "@/lib/publishing-auth";
import { kbReviewToken, validationOverview } from "@/lib/kb-validation";

type Ctx = { params: Promise<{ clientId: string }> };

async function own(orgId: string, clientId: string) {
  return prisma.client.findFirst({ where: { id: clientId, organizationId: orgId }, select: { id: true } });
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const c = await publishingCaller(false);
  if (c instanceof NextResponse) return c;
  const { clientId } = await ctx.params;
  if (!(await own(c.orgId, clientId))) return NextResponse.json({ success: false, error: "Company not found" }, { status: 404 });
  try {
    return NextResponse.json({ success: true, data: await validationOverview(c.orgId, clientId) });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const c = await publishingCaller(true);
  if (c instanceof NextResponse) return c;
  const { clientId } = await ctx.params;
  if (!(await own(c.orgId, clientId))) return NextResponse.json({ success: false, error: "Company not found" }, { status: 404 });
  const b = (await req.json().catch(() => null)) as { rotate?: unknown } | null;
  if (b?.rotate !== "internal" && b?.rotate !== "client") return NextResponse.json({ success: false, error: "Bad request" }, { status: 400 });
  try {
    await kbReviewToken(c.orgId, clientId, b.rotate, true);
    return NextResponse.json({ success: true, data: await validationOverview(c.orgId, clientId) });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
