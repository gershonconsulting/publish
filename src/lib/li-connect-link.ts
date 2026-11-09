/**
 * v0.14.0 — Client LinkedIn connect links (Olivier, 2026-11-09: "We need to be
 * able to publish on people pages as well for all our clients").
 *
 * Same idea as the X connect link (lib/x-connect-link.ts) and as Cloud
 * Campaign's "Linked Accounts": each Campaign/Internal company gets a private
 * link publish.gershon.ai/li-connect/gl_<48 hex>. The PERSON whose profile we
 * post on (e.g. Alexandre Rouleau for Altavia) opens it, signs in on
 * LinkedIn's own page and clicks Allow. Publish receives a revocable posting
 * permission (w_member_social) and posts the approved content as them through
 * the LinkedIn API — no Chrome signed in as them, no password shared.
 *
 * The callback refuses a LinkedIn member whose profile differs from the
 * company's LinkedIn destination when that destination is a /in/ profile.
 */
import prisma from "@/lib/db-raw";
import { SITE, PUBLISHING_CLIENT_WHERE, alertTeam, esc, getTarget } from "@/lib/publishing";
import { getLinked } from "@/lib/linked-accounts";
import { liEffectiveExpiry, liShouldRemind } from "@/lib/li-expiry";

const KEY = (clientId: string) => `li_connect:${clientId}`;
export const LI_LINK_RE = /^gl_[a-f0-9]{48}$/;

export async function liConnectToken(orgId: string, clientId: string, rotate = false): Promise<string> {
  const k = { organizationId_key: { organizationId: orgId, key: KEY(clientId) } };
  if (!rotate) {
    const row = await prisma.orgSetting.findUnique({ where: k });
    if (row?.value && LI_LINK_RE.test(row.value)) return row.value;
  }
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  const t = "gl_" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  await prisma.orgSetting.upsert({ where: k, create: { organizationId: orgId, key: KEY(clientId), value: t }, update: { value: t } });
  return t;
}

export function liConnectUrl(token: string): string {
  return `${SITE}/li-connect/${token}`;
}

export async function resolveLiConnect(token: string): Promise<{ orgId: string; clientId: string } | null> {
  if (!LI_LINK_RE.test(token)) return null;
  const row = await prisma.orgSetting.findFirst({ where: { key: { startsWith: "li_connect:" }, value: token } });
  if (!row?.organizationId) return null;
  const clientId = row.key.slice("li_connect:".length);
  const cl = await prisma.client.findFirst({
    where: { id: clientId, organizationId: row.organizationId, archivedAt: null, ...PUBLISHING_CLIENT_WHERE },
    select: { id: true },
  });
  return cl ? { orgId: row.organizationId, clientId } : null;
}

// ── v0.14.0: tell the team before a personal connection stops working ───────


/**
 * Once per expiry date and state ("soon" = within 10 days, then "expired"):
 * PUB-213 to the team with the person's connect link to forward. Never emails
 * the person directly (the team does the sending).
 */
export async function remindLiExpiring(orgId: string, now = Date.now()): Promise<{ clientId: string; state: string }[]> {
  const clients = await prisma.client.findMany({
    where: { organizationId: orgId, archivedAt: null, status: { not: "ARCHIVED" }, ...PUBLISHING_CLIENT_WHERE },
    select: { id: true, name: true },
  });
  const out: { clientId: string; state: string }[] = [];
  for (const cl of clients) {
    const l = await getLinked(orgId, cl.id);
    const c = l.linkedin?.personal ? l.linkedin : null;
    if (!c) continue;
    const expiry = liEffectiveExpiry(c);
    const key = `li_reconnect:${cl.id}`;
    const row = await prisma.orgSetting.findUnique({ where: { organizationId_key: { organizationId: orgId, key } } });
    const r = liShouldRemind(expiry, row?.value ?? null, now);
    if (!r.send) continue;
    const t = await getTarget(orgId, cl.id);
    const person = c.authors[0]?.name || "the person";
    const link = liConnectUrl(await liConnectToken(orgId, cl.id));
    const when = new Date(expiry).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
    const ok = await alertTeam(
      orgId,
      r.state === "expired" ? `${cl.name}: ${person}'s LinkedIn connection has expired` : `${cl.name}: ${person}'s LinkedIn connection expires ${when}`,
      `<p><b>${esc(cl.name)}</b> posts on <b>${esc(person)}</b>'s personal LinkedIn profile through the API.
       ${r.state === "expired" ? `That permission <b>expired on ${esc(when)}</b> — LinkedIn posts for this company will fail until it is renewed.` : `LinkedIn will stop that permission on <b>${esc(when)}</b>.`}</p>
       <p>Send ${esc(person)}${t.reviewerEmail ? ` (${esc(t.reviewerEmail)})` : ""} this link — they sign in on LinkedIn and click Allow again (about 1 minute):<br>
       <a href="${link}">${link}</a></p>`,
      "LI_PERSONAL_EXPIRING",
      { href: `${SITE}/publishing/accounts#li-links`, label: "Open Connections" },
    );
    if (ok) {
      await prisma.orgSetting.upsert({
        where: { organizationId_key: { organizationId: orgId, key } },
        create: { organizationId: orgId, key, value: r.stamp },
        update: { value: r.stamp },
      });
      out.push({ clientId: cl.id, state: r.state });
    }
  }
  return out;
}
