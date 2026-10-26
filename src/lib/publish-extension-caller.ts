/**
 * Who is calling Publish's /api/extension/* routes (v0.6.0).
 *
 * Same token / workspace binding as Social (lib/publish-caller.ts — the
 * workspace's extension token, or a client's gp_ publishing key), plus ONE
 * extra rule: Publish is internal (THREE-PLATFORM-SPLIT.md §8), so only the
 * primary (Gershon Consulting) workspace token may use these routes on
 * publish.gershon.ai. Another workspace's token is refused here (403). A gp_
 * key (one company's own publishing browser, issued from Connections) is a
 * narrowly scoped credential and is accepted as before.
 *
 * The middleware lets /api/extension/publish/* through without a session,
 * exactly like Social's does: the token is the credential, checked here.
 */
import prisma from "@/lib/db-raw";
import { resolvePublishCaller, type PublishCaller } from "@/lib/publish-caller";

let primaryId: string | null = null;
let primaryAt = 0;

export async function primaryOrgId(): Promise<string | null> {
  if (primaryId && Date.now() - primaryAt < 10 * 60 * 1000) return primaryId;
  const row = await prisma.organization.findFirst({ where: { isPrimary: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
  primaryId = row?.id ?? null;
  primaryAt = Date.now();
  return primaryId;
}

export type PublishExtCaller = PublishCaller | { ok: false; reason: "not_internal" };

export async function resolvePublishExtensionCaller(req: Request): Promise<PublishExtCaller> {
  const c = await resolvePublishCaller(req);
  if (!c.ok) return c;
  if (c.clientId) return c; // gp_ key: one company only, as in Social
  const primary = await primaryOrgId();
  if (!primary || c.orgId !== primary) return { ok: false, reason: "not_internal" };
  return c;
}

/** HTTP status for a refused caller: 403 for another workspace, 401 otherwise. */
export function refusedStatus(reason: string): 401 | 403 {
  return reason === "not_internal" ? 403 : 401;
}
