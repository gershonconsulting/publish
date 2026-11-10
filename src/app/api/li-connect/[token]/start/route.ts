export const runtime = "edge";
/** GET /api/li-connect/:token/start — public: sends the person to LinkedIn's own sign-in + Allow screen (v0.14.0). */
import { NextResponse } from "next/server";
import { SITE } from "@/lib/publishing";
import { LI_PERSON_SCOPES, appReady, getAppCreds, linkedinAuthorizeUrl, newState } from "@/lib/linked-accounts";
import { resolveLiConnect } from "@/lib/li-connect-link";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await resolveLiConnect(token);
  if (!r) return NextResponse.redirect(`${SITE}/li-connect/${encodeURIComponent(token)}?error=${encodeURIComponent("This link is not valid any more.")}`);
  const back = `/li-connect/${token}`;
  const app = await getAppCreds("linkedin");
  if (!appReady("linkedin", app)) return NextResponse.redirect(`${SITE}${back}?error=${encodeURIComponent("LinkedIn connection is not available right now — Gershon Consulting has been told.")}`);
  const { state } = await newState(r.orgId, r.clientId, "linkedin", "client link", back);
  return NextResponse.redirect(linkedinAuthorizeUrl(app.clientId!, state, LI_PERSON_SCOPES));
}
