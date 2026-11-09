export const runtime = "edge";
/**
 * GET /api/publishing/funnel?client=<id>
 * v0.12.0 Content funnel — the old CloudCampaign / HeroPost views on live
 * Publish data (see lib/publish-funnel.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { publishingCaller } from "@/lib/publishing-auth";
import { contentFunnel } from "@/lib/publish-funnel";

export async function GET(req: NextRequest) {
  const c = await publishingCaller(false);
  if (c instanceof NextResponse) return c;
  try {
    const client = new URL(req.url).searchParams.get("client") || null;
    const data = await contentFunnel(c.orgId, client);
    return NextResponse.json({ success: true, data }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Could not build the content funnel" }, { status: 500 });
  }
}
