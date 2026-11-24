export const runtime = "edge";
/**
 * GET /api/publishing/feature-status — v0.25.0 preview of the weekly feature-status
 * email (PUB-217). ?format=html returns the email body.
 */
import { NextRequest, NextResponse } from "next/server";
import { publishingCaller } from "@/lib/publishing-auth";
import { buildFeatureStatus } from "@/lib/feature-status";
import { FEATURES } from "@/lib/feature-status-data";

export async function GET(req: NextRequest) {
  const c = await publishingCaller(false);
  if (c instanceof NextResponse) return c;
  const r = buildFeatureStatus();
  if (new URL(req.url).searchParams.get("format") === "html") {
    return new NextResponse(`<h3>${r.subject}</h3>${r.html}`, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  return NextResponse.json({ success: true, data: { week: r.label, subject: r.subject, counts: r.counts, features: FEATURES } });
}
