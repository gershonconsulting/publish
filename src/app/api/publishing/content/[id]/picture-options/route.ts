export const runtime = "edge";
/**
 * v0.26.0 — 3 picture options for a post, real photos first (Olivier 2026-11-25).
 *
 * GET  /api/publishing/content/:id/picture-options            → the 3 options (same ones until refreshed)
 * GET  …?refresh=1                                            → 3 other ones
 * GET  …?q=retail+shelves                                     → search with the team's own words
 * POST { optionId }                                           → the chosen one becomes the post's picture
 */
import { NextRequest, NextResponse } from "next/server";
import { publishingCaller } from "@/lib/publishing-auth";
import { chooseOption, findOptions } from "@/lib/picture-options-db";
import { SOURCE_LABEL } from "@/lib/picture-options";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const c = await publishingCaller(true);
  if (c instanceof NextResponse) return c;
  try {
    const { id } = await ctx.params;
    const u = new URL(req.url);
    const r = await findOptions(c.orgId, id, { refresh: u.searchParams.get("refresh") === "1", query: u.searchParams.get("q") || undefined });
    if (!r) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({
      success: true,
      data: {
        query: r.query,
        options: r.options.map((o) => ({
          id: o.id, source: o.source, label: SOURCE_LABEL[o.source], thumb: o.thumb, title: o.title, credit: o.credit, license: o.license, page: o.page, ai: o.source === "ai",
        })),
      },
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const c = await publishingCaller(true);
  if (c instanceof NextResponse) return c;
  try {
    const { id } = await ctx.params;
    const b = (await req.json().catch(() => null)) as { optionId?: string } | null;
    if (!b?.optionId) return NextResponse.json({ success: false, error: "Pick one of the 3 pictures." }, { status: 400 });
    const r = await chooseOption(c.orgId, id, b.optionId, c.name || "Team");
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
