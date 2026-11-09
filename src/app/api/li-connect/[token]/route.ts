export const runtime = "edge";
/** GET /api/li-connect/:token — public: what the client LinkedIn connect page shows (v0.14.0). */
import { NextResponse } from "next/server";
import prisma from "@/lib/db-raw";
import { getTarget } from "@/lib/publishing";
import { getLinked, liProfileSlug } from "@/lib/linked-accounts";
import { liEffectiveExpiry } from "@/lib/li-expiry";
import { resolveLiConnect } from "@/lib/li-connect-link";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await resolveLiConnect(token);
  if (!r) return NextResponse.json({ success: false, error: "This link is not valid any more. Ask Gershon Consulting for a new one." }, { status: 404 });
  const [client, t, l] = await Promise.all([
    prisma.client.findFirst({ where: { id: r.clientId }, select: { name: true, logoUrl: true } }),
    getTarget(r.orgId, r.clientId),
    getLinked(r.orgId, r.clientId),
  ]);
  const p = l.linkedin?.personal ? l.linkedin : null;
  return NextResponse.json({
    success: true,
    data: {
      client: client?.name || "Your company",
      logoUrl: client?.logoUrl || null,
      reviewerName: t.reviewerName || null,
      profile: liProfileSlug(t.linkedinUrl),
      connected: p ? { name: p.authors[0]?.name || "LinkedIn member", vanity: p.vanity || null, at: p.connectedAt, expiresAt: liEffectiveExpiry(p), error: p.lastError || null } : null,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
