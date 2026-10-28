export const runtime = "edge";
/** POST /api/intelligence/chat {window, client, messages[]} — v0.9.0. Answers only; changes nothing. */
import { NextRequest, NextResponse } from "next/server";
import { publishingCaller } from "@/lib/publishing-auth";
import { WINDOWS, publishCompanies, type WindowKey } from "@/lib/publish-dashboard";
import { chat, type ChatMessage } from "@/lib/intelligence";

export async function POST(req: NextRequest) {
  const c = await publishingCaller(false);
  if (c instanceof NextResponse) return c;
  const body = (await req.json().catch(() => ({}))) as { window?: string; client?: string; messages?: ChatMessage[] };
  const window: WindowKey = (WINDOWS as readonly string[]).includes(String(body.window)) ? (body.window as WindowKey) : "week";
  let clientId: string | null = null;
  if (body.client) clientId = (await publishCompanies(c.orgId, body.client)).some((x) => x.id === body.client) ? body.client : null;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length || messages[messages.length - 1]?.role !== "user") {
    return NextResponse.json({ success: false, error: "Ask a question first." }, { status: 400 });
  }
  try {
    const r = await chat(c.orgId, { clientId, window, messages });
    return NextResponse.json({ success: true, data: r });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "The AI did not answer." }, { status: 502 });
  }
}
