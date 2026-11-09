export const runtime = "edge";
/**
 * GET  /api/publishing/li-links — every Campaign/Internal company with its client LinkedIn connect link + status (v0.14.0).
 * POST /api/publishing/li-links {clientId} — new link for that company (the old one stops working).
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db-raw";
import { publishingCaller } from "@/lib/publishing-auth";
import { PUBLISHING_CLIENT_WHERE, getTarget } from "@/lib/publishing";
import { getLinked, liProfileSlug } from "@/lib/linked-accounts";
import { liConnectToken, liConnectUrl } from "@/lib/li-connect-link";

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
    const [token, t, l] = await Promise.all([liConnectToken(c.orgId, cl.id), getTarget(c.orgId, cl.id), getLinked(c.orgId, cl.id)]);
    const p = l.linkedin?.personal ? l.linkedin : null;
    rows.push({
      id: cl.id, name: cl.name, clientType: cl.clientType, url: liConnectUrl(token),
      profile: liProfileSlug(t.linkedinUrl),
      connected: p ? p.authors[0]?.name || "LinkedIn member" : null,
      vanity: p?.vanity || null,
      expiresAt: p ? p.refreshExpiresAt || p.expiresAt : null,
      lastError: p?.lastError || null,
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
  return NextResponse.json({ success: true, data: { url: liConnectUrl(await liConnectToken(c.orgId, cl.id, true)) } });
}
