export const runtime = "edge";
/**
 * GET /api/publishing/published?date=YYYY-MM-DD&client=<id>
 * Published — daily view (v0.12.0): what went out that ET day, for which company.
 */
import { NextRequest, NextResponse } from "next/server";
import { publishingCaller } from "@/lib/publishing-auth";
import { publishedDay, todayET } from "@/lib/published-day";
import { ISO_DAY } from "@/lib/published-day-model";

export async function GET(req: NextRequest) {
  const c = await publishingCaller(false);
  if (c instanceof NextResponse) return c;
  try {
    const qs = new URL(req.url).searchParams;
    const d = qs.get("date") || "";
    const date = ISO_DAY.test(d) ? d : todayET();
    const data = await publishedDay(c.orgId, { date, clientId: qs.get("client") || null });
    return NextResponse.json({ success: true, data }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Could not load the published posts" }, { status: 500 });
  }
}
