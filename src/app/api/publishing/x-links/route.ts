export const runtime = "edge";
/**
 * GET  /api/publishing/x-links — every Campaign/Internal company with its client X connect link + status (v0.8.1).
 * POST /api/publishing/x-links {clientId} — new link for that company (the old one stops working).
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db-raw";
import { publishingCaller } from "@/lib/publishing-auth";
import { PUBLISHING_CLIENT_WHERE, getTarget } from "@/lib/publishing";
import { getLinked } from "@/lib/linked-accounts";
import { xConnectToken, xConnectUrl } from "@/lib/x-connect-link";

export async function GET() {
  const c = await publishingCaller(false);
  if (c instanceof NextResponse) return c;
  const clients = await prisma.client.findMany({
    where: { organizationId: c.orgId, archivedAt: null, status: { not: "ARCHIVED" }, ...PUBLISHING_CLIENT_WHERE },
    select: { id: true, name: true, clientType: true },
    orderBy: { name: "asc" },
  });
  const rows = [];
  for (const cl of clients) {
    const [token, t, l] = await Promise.all([xConnectToken(c.orgId, cl.id), getTarget(c.orgId, cl.id), getLinked(c.orgId, cl.id)]);
    rows.push({
      id: cl.id, name: cl.name, clientType: cl.clientType, url: xConnectUrl(token),
      xHandle: t.xHandle ? t.xHandle.replace(/^@/, "") : null,
      connected: l.x ? l.x.username : null, lastError: l.x?.lastError || null,
    });
  }
  return NextResponse.json({ success: true, data: rows });
}

export async function POST(req: NextRequest) {
  const c = await publishingCaller(true);
  if (c instanceof NextResponse) return c;
  const b = (await req.json().catch(() => null)) as { clientId?: string } | null;
  const cl = b?.clientId ? await prisma.client.findFirst({ where: { id: b.clientId, organizationId: c.orgId, ...PUBLISHING_CLIENT_WHERE }, select: { id: true } }) : null;
  if (!cl) return NextResponse.json({ success: false, error: "Unknown company." }, { status: 400 });
  return NextResponse.json({ success: true, data: { url: xConnectUrl(await xConnectToken(c.orgId, cl.id, true)) } });
}
