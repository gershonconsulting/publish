export const runtime = "edge";
/**
 * POST /api/knowledge-base/<clientId>/brand-upload (v0.18.0)
 *   multipart/form-data with "file" (brand book / guidelines: PDF, Word, text — max 10 MB)
 *   or JSON { text, name? } for pasted text (e.g. the colour codes the client emailed).
 * → Intelligence reads the colour codes, fonts, logo and brand rules; what the
 *   client shared replaces what was read from the website.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db-raw";
import { publishingCaller } from "@/lib/publishing-auth";
import { fileToText, importBrand } from "@/lib/knowledge-base";

type Ctx = { params: Promise<{ clientId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const c = await publishingCaller(true);
  if (c instanceof NextResponse) return c;
  const { clientId } = await ctx.params;
  const own = await prisma.client.findFirst({ where: { id: clientId, organizationId: c.orgId }, select: { id: true } });
  if (!own) return NextResponse.json({ success: false, error: "Company not found" }, { status: 404 });
  try {
    let text = "", from = "";
    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") return NextResponse.json({ success: false, error: "No file." }, { status: 400 });
      if (file.size > 10 * 1024 * 1024) return NextResponse.json({ success: false, error: "The file is over 10 MB." }, { status: 400 });
      from = file.name || "uploaded file";
      text = await fileToText(from, file);
    } else {
      const b = ((await req.json().catch(() => null)) || {}) as { text?: string; name?: string };
      text = String(b.text || "");
      from = (b.name || "Pasted text").slice(0, 120);
    }
    const kb = await importBrand(c.orgId, clientId, text, from);
    return NextResponse.json({ success: true, data: { kb, from } });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
