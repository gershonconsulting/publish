export const runtime = "edge";
/**
 * GET /api/publishing/summary?month=YYYY-MM&client=<id>
 * Publish's own Summary (v0.6.0): one row per CAMPAIGN / INTERNAL company.
 */
import { NextRequest, NextResponse } from "next/server";
import { publishingCaller } from "@/lib/publishing-auth";
import { currentMonth, summary } from "@/lib/publish-dashboard";

export async function GET(req: NextRequest) {
  const c = await publishingCaller(false);
  if (c instanceof NextResponse) return c;
  try {
    const qs = new URL(req.url).searchParams;
    const m = qs.get("month") || "";
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : currentMonth();
    const data = await summary(c.orgId, { month, clientId: qs.get("client") || null });
    return NextResponse.json({ success: true, data }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Could not build the summary" }, { status: 500 });
  }
}
