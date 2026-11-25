export const runtime = "edge";
/**
 * v0.27.0 — pictures the CLIENT chooses from (Olivier 2026-11-25: "Give us the
 * option to load 3 pictures for the client to validate").
 *
 * GET                              → the pictures loaded (data URLs)
 * POST { dataB64, mime, width?, height?, label? } → add one (max 3)
 * POST { fromOptions: true }       → load the 3 options found by "Choose the picture"
 * DELETE ?choice=<id>              → remove one;  DELETE ?all=1 → remove all
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db-raw";
import { publishingCaller } from "@/lib/publishing-auth";
import { IMAGE_MIMES, MAX_IMAGE_BYTES } from "@/lib/publishing";
import { addPictureChoice, clearPictureChoices, getChoices, removePictureChoice } from "@/lib/picture-choices";
import { MAX_CHOICES } from "@/lib/picture-choices-model";
import { optionsBytes } from "@/lib/picture-options-db";
import { SOURCE_LABEL } from "@/lib/picture-options";

async function owned(orgId: string, id: string) {
  const item = await prisma.contentItem.findFirst({ where: { id, organizationId: orgId }, include: { deliveries: true } });
  if (!item) return { error: NextResponse.json({ success: false, error: "Not found" }, { status: 404 }) };
  if (item.deliveries.some((d) => d.status === "POSTED" || d.status === "POSTING")) {
    return { error: NextResponse.json({ success: false, error: "Already published — the picture can't change now." }, { status: 409 }) };
  }
  return { item };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const c = await publishingCaller(true);
  if (c instanceof NextResponse) return c;
  const { id } = await ctx.params;
  const o = await owned(c.orgId, id);
  if (o.error) return o.error;
  const list = await getChoices(c.orgId, id);
  return NextResponse.json({ success: true, data: { max: MAX_CHOICES, choices: list.map((x) => ({ id: x.id, label: x.label, src: `data:${x.mime};base64,${x.dataB64}` })) } });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const c = await publishingCaller(true);
  if (c instanceof NextResponse) return c;
  try {
    const { id } = await ctx.params;
    const o = await owned(c.orgId, id);
    if (o.error) return o.error;
    const b = (await req.json().catch(() => null)) as { dataB64?: string; mime?: string; width?: number; height?: number; label?: string; fromOptions?: boolean } | null;
    if (b?.fromOptions) {
      const found = await optionsBytes(c.orgId, id);
      if (!found.length) return NextResponse.json({ success: false, error: "Show the 3 options first." }, { status: 400 });
      await clearPictureChoices(c.orgId, id);
      for (const f of found.slice(0, MAX_CHOICES)) {
        await addPictureChoice(c.orgId, id, { dataB64: f.dataB64, mime: f.mime, width: f.o.width, height: f.o.height, label: SOURCE_LABEL[f.o.source] });
      }
      return NextResponse.json({ success: true, data: { loaded: Math.min(found.length, MAX_CHOICES) } });
    }
    const mime = (b?.mime || "").toLowerCase();
    const data = (b?.dataB64 || "").replace(/^data:[^,]+,/, "");
    if (!IMAGE_MIMES.includes(mime)) return NextResponse.json({ success: false, error: "Use a JPEG, PNG or GIF picture." }, { status: 400 });
    if (!data || !/^[A-Za-z0-9+/=]+$/.test(data)) return NextResponse.json({ success: false, error: "The picture is empty." }, { status: 400 });
    if (Math.floor((data.length * 3) / 4) > MAX_IMAGE_BYTES) return NextResponse.json({ success: false, error: "The picture is over 5 MB." }, { status: 400 });
    const err = await addPictureChoice(c.orgId, id, { dataB64: data, mime, width: b?.width ?? null, height: b?.height ?? null, label: b?.label || "Loaded by the team" });
    if (err) return NextResponse.json({ success: false, error: err }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const c = await publishingCaller(true);
  if (c instanceof NextResponse) return c;
  const { id } = await ctx.params;
  const o = await owned(c.orgId, id);
  if (o.error) return o.error;
  const u = new URL(req.url);
  if (u.searchParams.get("all") === "1") await clearPictureChoices(c.orgId, id);
  else if (u.searchParams.get("choice")) await removePictureChoice(c.orgId, id, u.searchParams.get("choice")!);
  return NextResponse.json({ success: true });
}
