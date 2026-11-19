export const runtime = "edge";
/**
 * /api/knowledge-base/links (v0.23.0, Olivier 2026-11-19: "a dedicated link to all
 * clients so they can validate the content of these elements of knowledge").
 *   GET  → one row per company: client validation link, empty sections, progress.
 *   POST { release: "all" | <clientId> } → open the client link(s) now.
 * Publish never emails these links: the team copies them into its own email.
 */
import { NextRequest, NextResponse } from "next/server";
import { publishingCaller } from "@/lib/publishing-auth";
import { kbLinks, releaseClientLink } from "@/lib/kb-validation";

export async function GET() {
  const c = await publishingCaller(false);
  if (c instanceof NextResponse) return c;
  try {
    return NextResponse.json({ success: true, data: await kbLinks(c.orgId) });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const c = await publishingCaller(true);
  if (c instanceof NextResponse) return c;
  const b = (await req.json().catch(() => null)) as { release?: unknown } | null;
  const target = typeof b?.release === "string" ? b.release : "";
  if (!target) return NextResponse.json({ success: false, error: "Bad request" }, { status: 400 });
  try {
    const rows = await kbLinks(c.orgId);
    const ids = target === "all" ? rows.filter((r) => r.sections > 0).map((r) => r.clientId) : rows.some((r) => r.clientId === target) ? [target] : [];
    if (!ids.length) return NextResponse.json({ success: false, error: target === "all" ? "No company has knowledge to validate yet." : "Company not found" }, { status: 404 });
    for (const id of ids) await releaseClientLink(c.orgId, id, c.name);
    return NextResponse.json({ success: true, data: await kbLinks(c.orgId) });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
