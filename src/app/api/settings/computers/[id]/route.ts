export const runtime = "edge";
/** PATCH /api/settings/computers/<browserId> {name} — name a computer (empty = back to the extension's own label). */
import { NextRequest, NextResponse } from "next/server";
import { publishingCaller } from "@/lib/publishing-auth";
import { getBrowser, setBrowserName, validBrowserId } from "@/lib/publish-browsers";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const c = await publishingCaller(true);
  if (c instanceof NextResponse) return c;
  const id = validBrowserId((await params).id);
  if (!id || !(await getBrowser(c.orgId, id))) return NextResponse.json({ success: false, error: "Unknown computer." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  await setBrowserName(c.orgId, id, typeof body.name === "string" ? body.name : null);
  return NextResponse.json({ success: true });
}
