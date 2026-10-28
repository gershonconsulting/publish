export const runtime = "edge";
/**
 * POST /api/intelligence/fill-gap {clientId, max?} — v0.9.0.
 * Writes AI drafts (Cloudflare Workers AI) for the company's EMPTY posting days,
 * a couple per call; the page calls again while `remaining` > 0. Drafts only:
 * nothing is submitted, approved or published.
 * GET ?clientId= → the empty posting days (no AI call).
 */
import { NextRequest, NextResponse } from "next/server";
import { publishingCaller } from "@/lib/publishing-auth";
import { publishCompanies, runways } from "@/lib/publish-dashboard";
import { fillGaps } from "@/lib/autopilot";

async function gapsOf(orgId: string, clientId: string) {
  const cs = await publishCompanies(orgId, clientId);
  const co = cs.find((x) => x.id === clientId);
  if (!co) return null;
  const [r] = await runways(orgId, [co]);
  return { company: co.name, gaps: r?.gaps ?? [], perWeek: r?.perWeek ?? null };
}

export async function GET(req: NextRequest) {
  const c = await publishingCaller(false);
  if (c instanceof NextResponse) return c;
  const id = new URL(req.url).searchParams.get("clientId") || "";
  const g = id ? await gapsOf(c.orgId, id) : null;
  if (!g) return NextResponse.json({ success: false, error: "Pick a company." }, { status: 404 });
  return NextResponse.json({ success: true, data: g }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const c = await publishingCaller(true);
  if (c instanceof NextResponse) return c;
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; max?: number; days?: string[] };
  const id = typeof body.clientId === "string" ? body.clientId : "";
  const g = id ? await gapsOf(c.orgId, id) : null;
  if (!g) return NextResponse.json({ success: false, error: "Pick a company." }, { status: 404 });
  // Only days that are really empty slots; optionally the first N the user chose.
  const max = Math.max(1, Math.min(31, Number(body.max) || 7));
  const chosen = Array.isArray(body.days) ? g.gaps.filter((d) => body.days!.includes(d)) : g.gaps.slice(0, max);
  try {
    const r = await fillGaps(c.orgId, id, chosen, 2);
    return NextResponse.json({ success: true, data: { ...r, company: g.company } });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "The AI did not answer." }, { status: 502 });
  }
}
