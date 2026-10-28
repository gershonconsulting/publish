export const runtime = "edge";
/**
 * Settings → Intelligence (v0.9.0).
 *   GET  → {available, model, models}           ?test=1 also runs a 1-word live call
 * Read-only on purpose: the model setting row is shared with Social (same
 * database) — changing it here would change Social's AI too.
 */
import { NextRequest, NextResponse } from "next/server";
import { publishingCaller } from "@/lib/publishing-auth";
import { getAISettings, listModels, pingAI } from "@/lib/content/provider";

export async function GET(req: NextRequest) {
  const c = await publishingCaller(false);
  if (c instanceof NextResponse) return c;
  const s = await getAISettings();
  const models = await listModels();
  const test = new URL(req.url).searchParams.get("test") ? await pingAI() : null;
  return NextResponse.json({ success: true, data: { provider: "Cloudflare Workers AI", available: s.available, model: s.model, models, test } }, { headers: { "cache-control": "no-store" } });
}

