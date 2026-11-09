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
import { SITE, PUBLISHING_CLIENT_WHERE } from "@/lib/publishing";

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
