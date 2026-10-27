export const runtime = "edge";
/**
 * /api/publishing/my-pages — "Your LinkedIn pages" on Connections (v0.7.0).
 *
 * GET  → { accounts, pages, companies, connectUrl, canWrite }
 * POST { action: "link", clientId, urn } | { action: "unlink", clientId } | { action: "refresh" }
 */
import { NextRequest, NextResponse } from "next/server";
import { publishingCaller } from "@/lib/publishing-auth";
import { linkPage, listMyPages, saveMemberConn, unlinkPage } from "@/lib/my-pages";
import { getLinked, liRefreshAuthors, saveOrgNames, type LiConn } from "@/lib/linked-accounts";

export async function GET() {
  const c = await publishingCaller(false);
  if (c instanceof NextResponse) return c;
  try {
    const d = await listMyPages(c.orgId);
    // Connect starts on the first company (any company works: the page list is shared).
    const first = d.companies.find((x) => x.clientType === "INTERNAL") || d.companies[0];
    return NextResponse.json({
      success: true,
      data: { ...d, connectUrl: first ? `/api/publishing/oauth/linkedin/start?clientId=${encodeURIComponent(first.id)}&back=pages` : null, canWrite: c.canWrite },
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const c = await publishingCaller(true);
  if (c instanceof NextResponse) return c;
  const b = (await req.json().catch(() => null)) as { action?: string; clientId?: string; urn?: string } | null;
  try {
    if (b?.action === "link" && b.clientId && b.urn) {
      const r = await linkPage(c.orgId, b.clientId, b.urn);
      return NextResponse.json(r.ok ? { success: true, data: { url: r.url } } : { success: false, error: r.error }, { status: r.ok ? 200 : 400 });
    }
    if (b?.action === "unlink" && b.clientId) {
      await unlinkPage(c.orgId, b.clientId);
      return NextResponse.json({ success: true });
    }
    if (b?.action === "refresh") {
      const d = await listMyPages(c.orgId);
      const seen = new Set<string>();
      const out: { member: string; pages: number; namesStatus: string | null }[] = [];
      for (const co of d.companies) {
        const li = (await getLinked(c.orgId, co.id)).linkedin as LiConn | null | undefined;
        if (!li?.memberUrn || seen.has(li.memberUrn)) continue;
        seen.add(li.memberUrn);
        const fresh = await liRefreshAuthors(li);
        await saveMemberConn(c.orgId, fresh);
        const learned: Record<string, { name: string; vanity: string | null; at: string; source: "api" }> = {};
        for (const a of fresh.authors) if (a.kind === "organization" && !/^Page \d+$/.test(a.name)) learned[a.id] = { name: a.name, vanity: a.vanity, at: new Date().toISOString(), source: "api" };
        await saveOrgNames(c.orgId, learned);
        out.push({ member: li.memberUrn, pages: fresh.authors.filter((a) => a.kind === "organization").length, namesStatus: fresh.namesStatus ?? null });
      }
      return NextResponse.json({ success: true, data: { refreshed: out } });
    }
    return NextResponse.json({ success: false, error: "Bad request" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
