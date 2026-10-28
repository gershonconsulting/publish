export const runtime = "edge";
/**
 * GET /api/publishing/oauth/:net/callback — LinkedIn / X send the account owner
 * back here after "Allow" (v4.60.0). The code is exchanged for the posting
 * permission, which is stored sealed on the company (lib/linked-accounts).
 *
 * v0.7.1: returns to /publishing/accounts (Publish has no /settings page — the
 * old address 404'd). One LinkedIn "Allow" now connects EVERY Publish company
 * whose page the signed-in admin manages, each posting as its own page.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db-raw";
import { SITE, getTarget, saveTarget, PUBLISHING_CLIENT_WHERE } from "@/lib/publishing";
import { getLinked, linkedinConnect, liAuthorUrl, pickAuthor, saveLinked, saveOrgNames, takeState, withNames, getOrgNames, xConnect, type LiConn } from "@/lib/linked-accounts";

const done = (q: string) => NextResponse.redirect(`${SITE}/publishing/accounts?${q}#pages`);

export async function GET(req: NextRequest, ctx: { params: Promise<{ net: string }> }) {
  const { net } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  const st = await takeState(sp.get("state") || "");
  // v0.8.1: a client X connect link (/x-connect/<token>) comes back to that public page, never to Connections.
  const pub = st?.back && /^\/x-connect\/gx_[a-f0-9]{48}$/.test(st.back) ? st.back : null;
  const back = (q: Record<string, string>) => NextResponse.redirect(`${SITE}${pub}?${new URLSearchParams(q)}`);
  if (pub && st) {
    if (sp.get("error")) return back({ error: sp.get("error") === "access_denied" ? "You did not click Allow — nothing was connected." : `X: ${sp.get("error_description") || sp.get("error")}` });
    const code0 = sp.get("code");
    if (!code0) return back({ error: "X sent no authorization back. Please try again." });
    try {
      const l = await getLinked(st.orgId, st.clientId);
      const t = await getTarget(st.orgId, st.clientId);
      const x = await xConnect(code0, st.verifier || "", st.by);
      const want = (t.xHandle || "").replace(/^@/, "").toLowerCase();
      if (want && x.username.toLowerCase() !== want) {
        return back({ error: `You are signed in to X as @${x.username}, but this link is for @${t.xHandle!.replace(/^@/, "")}. Switch account on x.com, then press Connect again.` });
      }
      l.x = x;
      if (!t.xHandle) await saveTarget(st.orgId, st.clientId, { xHandle: x.username });
      await saveLinked(st.orgId, st.clientId, l);
      return back({ connected: x.username });
    } catch (e) {
      return back({ error: e instanceof Error ? e.message : "Connection failed" });
    }
  }
  if (!st || st.net !== net) return done(`linked_error=${encodeURIComponent("This connection link expired — press Connect again.")}`);
  if (sp.get("error")) return done(`linked_error=${encodeURIComponent(`${net === "x" ? "X" : "LinkedIn"}: ${sp.get("error_description") || sp.get("error")}`)}`);
  const code = sp.get("code");
  if (!code) return done(`linked_error=${encodeURIComponent("No authorization came back — press Connect again.")}`);
  try {
    if (net !== "linkedin") {
      const l = await getLinked(st.orgId, st.clientId);
      const t = await getTarget(st.orgId, st.clientId);
      l.x = await xConnect(code, st.verifier || "", st.by);
      if (!t.xHandle) await saveTarget(st.orgId, st.clientId, { xHandle: l.x.username });
      await saveLinked(st.orgId, st.clientId, l);
      return done(`linked=x&company=${encodeURIComponent(st.clientId)}`);
    }

    const first = await getLinked(st.orgId, st.clientId);
    const conn0 = await linkedinConnect(code, st.by, first.linkedin);
    // v0.7.2: remember page names; fill the ones LinkedIn did not give from names learned before
    // (API or the Publish extension), so pickAuthor can match companies by name.
    const at = new Date().toISOString();
    const learned: Record<string, { name: string; vanity: string | null; at: string; source: "api" }> = {};
    for (const p of conn0.authors) if (p.kind === "organization" && !/^Page \d+$/.test(p.name)) learned[p.id] = { name: p.name, vanity: p.vanity, at, source: "api" };
    await saveOrgNames(st.orgId, learned).catch(() => null);
    const conn: LiConn = { ...conn0, authors: withNames(conn0.authors, await getOrgNames(st.orgId).catch(() => ({}))) };
    const clients = await prisma.client.findMany({
      where: { organizationId: st.orgId, archivedAt: null, status: { not: "ARCHIVED" }, ...PUBLISHING_CLIENT_WHERE },
      select: { id: true, name: true },
    });
    const connected: string[] = [];
    const noPage: string[] = [];
    for (const cl of clients) {
      const isFirst = cl.id === st.clientId;
      const l = isFirst ? first : await getLinked(st.orgId, cl.id);
      // Other companies: only fill empty ones or refresh ones made by this same LinkedIn member.
      if (!isFirst && l.linkedin && l.linkedin.memberUrn && l.linkedin.memberUrn !== conn.memberUrn) continue;
      const t = await getTarget(st.orgId, cl.id);
      const kept = l.linkedin?.author && conn.authors.some((a) => a.urn === l.linkedin!.author) ? conn.authors.find((a) => a.urn === l.linkedin!.author)! : null;
      const a = kept || pickAuthor(conn.authors, t.linkedinUrl, cl.name);
      if (!a) {
        if (isFirst) noPage.push(cl.name);
        continue;
      }
      const c: LiConn = { ...conn, author: a.urn, lastError: null };
      l.linkedin = c;
      await saveLinked(st.orgId, cl.id, l);
      const url = liAuthorUrl(a);
      if (url && !t.linkedinUrl) await saveTarget(st.orgId, cl.id, { linkedinUrl: url });
      connected.push(cl.name);
    }
    const q = new URLSearchParams({ linked: "linkedin", company: st.clientId, count: String(connected.length) });
    if (noPage.length) q.set("linked_error", `${noPage[0]}: none of the LinkedIn pages you manage matches this company, so it stays on the Chrome extension. Ask its page owner to make you an admin, then connect again.`);
    return done(q.toString());
  } catch (e) {
    return done(`linked_error=${encodeURIComponent(e instanceof Error ? e.message : "Connection failed")}`);
  }
}
