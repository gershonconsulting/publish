export const runtime = "edge";
/**
 * /api/kb-review/:token — Knowledge validation (v0.16.0). No account: the
 * private link IS the access, scoped to one company and one level
 * (ki_… = internal check by the Gershon team, kc_… = the client).
 * The client level answers "not open yet" until every section passed the
 * internal check. Rotating the link in Knowledge Base → Validation revokes it.
 *
 * GET  → { level, client, logoUrl, agency, open, sections, summary }
 * POST { section, status: "ok" | "changes", comment?, name?, text? }
 *      text (internal only) saves a corrected section to the Knowledge Base
 *      and records the verdict on the new text.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveKbReviewToken, reviewPage, submitVerdict } from "@/lib/kb-validation";

const GONE = "This review link is not valid any more.";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await resolveKbReviewToken(token);
  if (!r) return NextResponse.json({ success: false, error: GONE }, { status: 404 });
  try {
    return NextResponse.json({ success: true, data: await reviewPage(r.orgId, r.clientId, r.level) });
  } catch {
    return NextResponse.json({ success: false, error: "Could not load." }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await resolveKbReviewToken(token);
  if (!r) return NextResponse.json({ success: false, error: GONE }, { status: 404 });
  const b = (await req.json().catch(() => null)) as { section?: unknown; status?: unknown; comment?: unknown; name?: unknown; text?: unknown } | null;
  if (!b || typeof b.section !== "string" || (b.status !== "ok" && b.status !== "changes")) {
    return NextResponse.json({ success: false, error: "Bad request" }, { status: 400 });
  }
  try {
    const out = await submitVerdict(r.orgId, r.clientId, r.level, {
      section: b.section,
      status: b.status,
      comment: typeof b.comment === "string" ? b.comment : null,
      name: typeof b.name === "string" ? b.name : null,
      text: typeof b.text === "string" ? b.text : null,
    });
    if ("error" in out) return NextResponse.json({ success: false, error: out.error }, { status: 400 });
    return NextResponse.json({ success: true, data: out });
  } catch {
    return NextResponse.json({ success: false, error: "Could not save." }, { status: 500 });
  }
}
