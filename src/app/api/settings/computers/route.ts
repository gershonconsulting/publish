export const runtime = "edge";
/**
 * GET /api/settings/computers — v0.9.0 Settings → Computers.
 * Every Chrome that ran the Publish (or, during the transition, Social)
 * extension for this workspace in the last 30 days, with a one-word state:
 * working / out_of_date / signed_out / offline.
 */
import { NextResponse } from "next/server";
import { publishingCaller } from "@/lib/publishing-auth";
import { listBrowsers } from "@/lib/publish-browsers";
import { browserView } from "@/lib/publish-dashboard";
import { EXTENSION_LATEST } from "@/lib/extension-version";

export async function GET() {
  const c = await publishingCaller(false);
  if (c instanceof NextResponse) return c;
  try {
    const now = Date.now();
    const computers = (await listBrowsers(c.orgId)).map((b) => browserView(b, now));
    return NextResponse.json({ success: true, data: { latest: EXTENSION_LATEST, computers, canWrite: c.canWrite } }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Unavailable" }, { status: 500 });
  }
}
