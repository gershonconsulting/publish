export const runtime = "edge";
/** v0.27.0 — a picture the client can choose, served on the review link (the token is the access). */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db-raw";
import { resolveReviewToken } from "@/lib/publishing";
import { getChoices } from "@/lib/picture-choices";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string; itemId: string; choiceId: string }> }) {
  const { token, itemId, choiceId } = await ctx.params;
  const r = await resolveReviewToken(token);
  if (!r) return new NextResponse("Not found", { status: 404 });
  const item = await prisma.contentItem.findFirst({ where: { id: itemId, organizationId: r.orgId, clientId: r.clientId }, select: { id: true } });
  if (!item) return new NextResponse("Not found", { status: 404 });
  const c = (await getChoices(r.orgId, itemId)).find((x) => x.id === choiceId);
  if (!c) return new NextResponse("Not found", { status: 404 });
  const bin = atob(c.dataB64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new NextResponse(bytes, { headers: { "Content-Type": c.mime, "Cache-Control": "private, max-age=3600" } });
}
