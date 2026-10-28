/**
 * v0.8.1 — Client X connect links (Olivier, 2026-10-28: "1").
 *
 * Each Campaign/Internal company gets a private link
 * publish.gershon.ai/x-connect/gx_<48 hex>. The client opens it, signs in to
 * THEIR OWN X account on X's own screen and clicks Allow: Publish receives a
 * revocable posting permission through the Gershon Consulting X developer app.
 * Nobody at Gershon ever sees or types the client's X password.
 *
 * The link only connects X for that one company, and the callback refuses an
 * X account whose handle differs from the company's X handle.
 */
import prisma from "@/lib/db-raw";
import { SITE, PUBLISHING_CLIENT_WHERE } from "@/lib/publishing";

const KEY = (clientId: string) => `x_connect:${clientId}`;
const RE = /^gx_[a-f0-9]{48}$/;

export async function xConnectToken(orgId: string, clientId: string, rotate = false): Promise<string> {
  const k = { organizationId_key: { organizationId: orgId, key: KEY(clientId) } };
  if (!rotate) {
    const row = await prisma.orgSetting.findUnique({ where: k });
    if (row?.value && RE.test(row.value)) return row.value;
  }
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  const t = "gx_" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  await prisma.orgSetting.upsert({ where: k, create: { organizationId: orgId, key: KEY(clientId), value: t }, update: { value: t } });
  return t;
}

export function xConnectUrl(token: string): string {
  return `${SITE}/x-connect/${token}`;
}

export async function resolveXConnect(token: string): Promise<{ orgId: string; clientId: string } | null> {
  if (!RE.test(token)) return null;
  const row = await prisma.orgSetting.findFirst({ where: { key: { startsWith: "x_connect:" }, value: token } });
  if (!row?.organizationId) return null;
  const clientId = row.key.slice("x_connect:".length);
  const cl = await prisma.client.findFirst({
    where: { id: clientId, organizationId: row.organizationId, archivedAt: null, ...PUBLISHING_CLIENT_WHERE },
    select: { id: true },
  });
  return cl ? { orgId: row.organizationId, clientId } : null;
}
