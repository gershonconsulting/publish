/**
 * v0.20.0 — connection history store. OrgSetting `connlog:<clientId>` holds the
 * company's events as plain JSON (names, dates, reasons — never tokens).
 * No schema change. Logic lives in conn-log-model.ts (pure, tested).
 */
import prisma from "@/lib/db-raw";
import { appendEvents, diffLinked, reconcile, type ConnEvent, type LinkedLike } from "@/lib/conn-log-model";

const KEY = (clientId: string) => `connlog:${clientId}`;

export async function getConnLog(orgId: string, clientId: string): Promise<ConnEvent[]> {
  const row = await prisma.orgSetting.findUnique({ where: { organizationId_key: { organizationId: orgId, key: KEY(clientId) } } });
  try { return row?.value ? (JSON.parse(row.value) as ConnEvent[]) : []; } catch { return []; }
}

async function saveConnLog(orgId: string, clientId: string, events: ConnEvent[]): Promise<void> {
  const value = JSON.stringify(events);
  await prisma.orgSetting.upsert({
    where: { organizationId_key: { organizationId: orgId, key: KEY(clientId) } },
    create: { organizationId: orgId, key: KEY(clientId), value },
    update: { value },
  });
}

/** Called by saveLinked: log what changed between the old and new connections. Never throws. */
export async function logLinkedChange(orgId: string, clientId: string, prev: LinkedLike, next: LinkedLike, by: string | null): Promise<void> {
  try {
    const now = new Date().toISOString();
    const log = await getConnLog(orgId, clientId);
    // Catch up first (e.g. an expiry nobody saved), then the change itself.
    const caught = reconcile(log, prev);
    const add = diffLinked(prev, next, now, by);
    if (caught.length || add.length) await saveConnLog(orgId, clientId, appendEvents(log, [...caught, ...add]));
  } catch { /* the log must never block a connection */ }
}

/** Bring the log up to date with the current state (expiries, first sight). Returns the full log. */
export async function syncConnLog(orgId: string, clientId: string, cur: LinkedLike): Promise<ConnEvent[]> {
  const log = await getConnLog(orgId, clientId);
  const add = reconcile(log, cur);
  if (!add.length) return log;
  const next = appendEvents(log, add);
  await saveConnLog(orgId, clientId, next).catch(() => null);
  return next;
}
