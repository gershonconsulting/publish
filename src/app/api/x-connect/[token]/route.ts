export const runtime = "edge";
/** GET /api/x-connect/:token — public: what the client X connect page shows (v0.8.1). */
import { NextResponse } from "next/server";
import prisma from "@/lib/db-raw";
import { getTarget } from "@/lib/publishing";
import { getLinked } from "@/lib/linked-accounts";
import { resolveXConnect } from "@/lib/x-connect-link";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await resolveXConnect(token);
  if (!r) return NextResponse.json({ success: false, error: "This link is not valid any more. Ask Gershon Consulting for a new one." }, { status: 404 });
  const [client, t, l] = await Promise.all([
    prisma.client.findFirst({ where: { id: r.clientId }, select: { name: true, logoUrl: true } }),
    getTarget(r.orgId, r.clientId),
    getLinked(r.orgId, r.clientId),
  ]);
  return NextResponse.json({
    success: true,
    data: {
      client: client?.name || "Your company",
      logoUrl: client?.logoUrl || null,
      xHandle: t.xHandle ? t.xHandle.replace(/^@/, "") : null,
      connected: l.x ? { username: l.x.username, at: l.x.connectedAt, error: l.x.lastError || null } : null,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
