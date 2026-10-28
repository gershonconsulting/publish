export const runtime = "edge";
/**
 * Intelligence (v0.9.0) — Cloudflare Workers AI analysis + suggestions.
 *   GET  /api/intelligence?window=&client=   cached analysis (no AI call) or null
 *   POST /api/intelligence {window, client, refresh}   build (or serve fresh cache)
 * See lib/intelligence.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { publishingCaller } from "@/lib/publishing-auth";
import { WINDOWS, type WindowKey } from "@/lib/publish-dashboard";
import { analyze, readCached } from "@/lib/intelligence";
import { publishCompanies } from "@/lib/publish-dashboard";

function pickWindow(v: unknown): WindowKey {
  return (WINDOWS as readonly string[]).includes(String(v)) ? (v as WindowKey) : "week";
}

async function allowedClient(orgId: string, id: unknown): Promise<string | null> {
  if (typeof id !== "string" || !id) return null;
  const cs = await publishCompanies(orgId, id);
  return cs.some((c) => c.id === id) ? id : null;
}

export async function GET(req: NextRequest) {
  const c = await publishingCaller(false);
  if (c instanceof NextResponse) return c;
  const qs = new URL(req.url).searchParams;
  const clientId = await allowedClient(c.orgId, qs.get("client"));
  const data = await readCached(c.orgId, clientId, pickWindow(qs.get("window")));
  return NextResponse.json({ success: true, data }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const c = await publishingCaller(false);
  if (c instanceof NextResponse) return c;
  const body = (await req.json().catch(() => ({}))) as { window?: string; client?: string; refresh?: boolean };
  try {
    const clientId = await allowedClient(c.orgId, body.client);
    const data = await analyze(c.orgId, { clientId, window: pickWindow(body.window), refresh: !!body.refresh });
    return NextResponse.json({ success: true, data }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Intelligence failed" }, { status: 500 });
  }
}
