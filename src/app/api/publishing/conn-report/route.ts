export const runtime = "edge";
/**
 * GET /api/publishing/conn-report — v0.21.0 preview of the weekly connections
 * report (PUB-215): every company, worst first. ?format=html returns the email body.
 */
import { NextRequest, NextResponse } from "next/server";
import { publishingCaller } from "@/lib/publishing-auth";
import { buildConnReport, connReportHtml, connReportSubject } from "@/lib/conn-report";
import { counts } from "@/lib/conn-report-model";

export async function GET(req: NextRequest) {
  const c = await publishingCaller(false);
  if (c instanceof NextResponse) return c;
  const { rows, label } = await buildConnReport(c.orgId);
  if (new URL(req.url).searchParams.get("format") === "html") {
    return new NextResponse(`<h3>${connReportSubject(rows, label)}</h3>${connReportHtml(rows, label)}`, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  return NextResponse.json({ success: true, data: { week: label, subject: connReportSubject(rows, label), counts: counts(rows), rows } });
}
