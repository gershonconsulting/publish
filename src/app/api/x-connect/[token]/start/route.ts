export const runtime = "edge";
/** GET /api/x-connect/:token/start — public: sends the client to X's own sign-in + Allow screen (v0.8.1). */
import { NextResponse } from "next/server";
import { SITE } from "@/lib/publishing";
import { appReady, getAppCreds, newState, xAuthorizeUrl } from "@/lib/linked-accounts";
import { resolveXConnect } from "@/lib/x-connect-link";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await resolveXConnect(token);
  if (!r) return NextResponse.redirect(`${SITE}/x-connect/${encodeURIComponent(token)}?error=${encodeURIComponent("This link is not valid any more.")}`);
  const back = `/x-connect/${token}`;
  const app = await getAppCreds("x");
  if (!appReady("x", app)) return NextResponse.redirect(`${SITE}${back}?error=${encodeURIComponent("X connection is not available right now — Gershon Consulting has been told.")}`);
  const { state, challenge } = await newState(r.orgId, r.clientId, "x", "client link", back);
  return NextResponse.redirect(xAuthorizeUrl(app.clientId!, state, challenge!));
}
