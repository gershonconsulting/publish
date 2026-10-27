/**
 * "Your LinkedIn pages" (v0.7.0).
 *
 * RULE (Olivier, 2026-10-27): when he connects with his LinkedIn account,
 * Publish must show every company page he is an admin of, and let him link
 * each page to a CAMPAIGN or INTERNAL company. Content VALIDATED by the client
 * is then published on that page from his account, by the Publish Chrome
 * extension (never by Claude, never by the server unless the workspace opts in).
 *
 * One LinkedIn login is enough: the page list comes from the connection made
 * on any company (stored sealed per company, lib/linked-accounts). Linking a
 * page to company X copies that connection onto X with the page as author and
 * points X's LinkedIn destination at the page.
 */
import prisma from "@/lib/db-raw";
import { getTarget, saveTarget, PUBLISHING_CLIENT_WHERE } from "@/lib/publishing";
import {
  getLinked, getOrgNames, liAuthorUrl, saveLinked, withNames, type LiAuthor, type LiConn, type Linked,
} from "@/lib/linked-accounts";

export type MyPage = {
  urn: string;
  id: string;
  name: string;
  named: boolean;
  url: string;
  connectedBy: string | null;
  /** Companies this page is linked to (author of their connection, or their LinkedIn destination). */
  linkedTo: { id: string; name: string }[];
  /** Best-guess company by name / page address, when not linked yet. */
  suggest: { id: string; name: string } | null;
};
export type MyAccount = { memberUrn: string; connectedBy: string | null; connectedAt: string; namesStatus: string | null; expiresAt: string };

type Co = { id: string; name: string; clientType: string };

export const norm = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\b(inc|llc|ltd|sas|sa|gmbh|corp|corporation|company|co|group|international|intl|usa|us|na)\b/g, "").replace(/[^a-z0-9]/g, "");

function slugOf(url: string | null | undefined): string | null {
  const m = String(url || "").match(/linkedin\.com\/(?:company|showcase)\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]).toLowerCase() : null;
}

/** Every company's connection, and the freshest connection per LinkedIn member. */
async function load(orgId: string) {
  const companies = (await prisma.client.findMany({
    where: { organizationId: orgId, archivedAt: null, status: { not: "ARCHIVED" }, ...PUBLISHING_CLIENT_WHERE },
    select: { id: true, name: true, clientType: true },
    orderBy: [{ clientType: "desc" }, { name: "asc" }],
  })) as Co[];
  const linked = new Map<string, Linked>();
  const targets = new Map<string, string | null>();
  const byMember = new Map<string, { conn: LiConn; clientId: string }>();
  for (const c of companies) {
    const [l, t] = await Promise.all([getLinked(orgId, c.id), getTarget(orgId, c.id)]);
    linked.set(c.id, l);
    targets.set(c.id, t.linkedinUrl);
    const li = l.linkedin;
    if (!li?.memberUrn || !li.authors?.length) continue;
    const cur = byMember.get(li.memberUrn);
    if (!cur || Date.parse(li.connectedAt) > Date.parse(cur.conn.connectedAt)) byMember.set(li.memberUrn, { conn: li, clientId: c.id });
  }
  return { companies, linked, targets, byMember };
}

export async function listMyPages(orgId: string): Promise<{ accounts: MyAccount[]; pages: MyPage[]; companies: Co[] }> {
  const { companies, linked, targets, byMember } = await load(orgId);
  const names = await getOrgNames(orgId);
  const accounts: MyAccount[] = [];
  const pages: MyPage[] = [];
  const seen = new Set<string>();
  for (const { conn } of byMember.values()) {
    accounts.push({ memberUrn: conn.memberUrn!, connectedBy: conn.connectedBy, connectedAt: conn.connectedAt, namesStatus: conn.namesStatus ?? null, expiresAt: conn.refreshExpiresAt || conn.expiresAt });
    for (const a of withNames(conn.authors, names)) {
      if (a.kind !== "organization" || seen.has(a.urn)) continue;
      seen.add(a.urn);
      pages.push(toPage(a, conn, companies, linked, targets));
    }
  }
  // Suggestions: never suggest a company that already has a page linked.
  const taken = new Set(pages.flatMap((p) => p.linkedTo.map((c) => c.id)));
  for (const p of pages) if (p.suggest && (p.linkedTo.length || taken.has(p.suggest.id))) p.suggest = null;
  pages.sort((a, b) => Number(b.linkedTo.length > 0) - Number(a.linkedTo.length > 0) || Number(!!b.suggest) - Number(!!a.suggest) || Number(b.named) - Number(a.named) || a.name.localeCompare(b.name));
  return { accounts, pages, companies };
}

function toPage(a: LiAuthor, conn: LiConn, companies: Co[], linked: Map<string, Linked>, targets: Map<string, string | null>): MyPage {
  const keys = new Set([a.id, (a.vanity || "").toLowerCase()].filter(Boolean));
  const named = !/^Page \d+$/.test(a.name);
  const linkedTo = companies
    .filter((c) => linked.get(c.id)?.linkedin?.author === a.urn || (() => { const s = slugOf(targets.get(c.id)); return !!s && keys.has(s); })())
    .map((c) => ({ id: c.id, name: c.name }));
  let suggest: MyPage["suggest"] = null;
  if (named) {
    const n = norm(a.name);
    const v = norm(a.vanity || "");
    const hit = companies.find((c) => norm(c.name) === n || (!!v && norm(c.name) === v))
      || companies.find((c) => { const s = norm(slugOf(targets.get(c.id)) || ""); return !!s && (s === v || s === n); })
      || companies.find((c) => { const cn = norm(c.name); return cn.length >= 5 && n.length >= 5 && (n.startsWith(cn) || cn.startsWith(n)); });
    if (hit) suggest = { id: hit.id, name: hit.name };
  }
  return { urn: a.urn, id: a.id, name: a.name, named, url: liAuthorUrl(a) || `https://www.linkedin.com/company/${a.id}/`, connectedBy: conn.connectedBy, linkedTo, suggest };
}

/** Link one of your pages to a company: posts for that company go to that page. */
export async function linkPage(orgId: string, clientId: string, urn: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { companies, byMember } = await load(orgId);
  if (!companies.some((c) => c.id === clientId)) return { ok: false, error: "Unknown company." };
  const src = Array.from(byMember.values()).find((m) => m.conn.authors.some((a) => a.urn === urn));
  if (!src) return { ok: false, error: "That page isn't in your LinkedIn connection — refresh the page list." };
  const names = await getOrgNames(orgId);
  const a = withNames(src.conn.authors, names).find((x) => x.urn === urn)!;
  const l = await getLinked(orgId, clientId);
  l.linkedin = { ...src.conn, authors: withNames(src.conn.authors, names), author: urn, lastError: null };
  await saveLinked(orgId, clientId, l);
  const url = liAuthorUrl(a) || `https://www.linkedin.com/company/${a.id}/`;
  const t = await getTarget(orgId, clientId);
  if (!t.linkedinUrl || !/\/groups\//.test(t.linkedinUrl)) await saveTarget(orgId, clientId, { linkedinUrl: url });
  return { ok: true, url };
}

/** Unlink: the company keeps its destination but loses the page link. */
export async function unlinkPage(orgId: string, clientId: string): Promise<void> {
  const l = await getLinked(orgId, clientId);
  l.linkedin = null;
  await saveLinked(orgId, clientId, l);
}

/** Every page id still without a name (for the extension to look up). */
export async function unnamedPageIds(orgId: string): Promise<string[]> {
  const { byMember } = await load(orgId);
  const names = await getOrgNames(orgId);
  const out = new Set<string>();
  for (const { conn } of byMember.values()) for (const a of conn.authors) if (a.kind === "organization" && /^Page \d+$/.test(a.name) && !names[a.id]) out.add(a.id);
  return Array.from(out);
}

/** Store refreshed page lists back on every company sharing that LinkedIn member. */
export async function saveMemberConn(orgId: string, fresh: LiConn): Promise<number> {
  const { companies, linked } = await load(orgId);
  let n = 0;
  for (const c of companies) {
    const l = linked.get(c.id);
    if (!l?.linkedin || l.linkedin.memberUrn !== fresh.memberUrn) continue;
    l.linkedin = { ...fresh, author: l.linkedin.author };
    await saveLinked(orgId, c.id, l);
    n++;
  }
  return n;
}

export { type Co as PageCompany };
