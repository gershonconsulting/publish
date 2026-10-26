export const runtime = "edge";
/**
 * GET /api/publishing/dashboard?window=week|month|this_month|year|all&client=<id>
 * Publish's own dashboard (v0.6.0) — read-only. See lib/publish-dashboard.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { publishingCaller } from "@/lib/publishing-auth";
import { dashboard, WINDOWS, type WindowKey } from "@/lib/publish-dashboard";

export async function GET(req: NextRequest) {
  const c = await publishingCaller(false);
  if (c instanceof NextResponse) return c;
  try {
    const qs = new URL(req.url).searchParams;
    const w = (qs.get("window") || "week") as WindowKey;
    const window: WindowKey = (WINDOWS as readonly string[]).includes(w) ? w : "week";
    const clientId = qs.get("client") || null;
    const data = await dashboard(c.orgId, { window, clientId });
    return NextResponse.json({ success: true, data }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Could not build the dashboard" }, { status: 500 });
  }
}
