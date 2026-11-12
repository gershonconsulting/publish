/**
 * v0.18.2 — database side of the burst window (logic: lib/mail-dedupe.ts).
 *
 * Storage: the existing org_settings table, no migration.
 *   mailq_last:<group>:<clientId>          → ms of the last email of that group to that company
 *   mailq:<group>:<clientId>:<eventId>     → one held email (JSON HeldEvent), one row each,
 *                                            so concurrent requests never overwrite each other.
 * flushHeld() runs at the start of every sweep() (extension every minute,
 * pages on load, GitHub cron every 15 min). A held row is deleted only after
 * its combined email was accepted by Resend; two concurrent flushes send the
 * same Idempotency-Key, so Resend delivers it once.
 */
import prisma from "@/lib/db-raw";
import {
  BURST_WINDOW_MS, HELD_PREFIX, burstHeld, combineHeld, flushDue, groupHeld, heldKey, lastSentKey, mailIdempotencyKey, parseHeld, type HeldEvent,
} from "@/lib/mail-dedupe";
import { PUBLISH_MAILS, type PubMail } from "@/lib/publishing-mail";

async function getValue(orgId: string, key: string): Promise<string | null> {
  return (await prisma.orgSetting.findUnique({ where: { organizationId_key: { organizationId: orgId, key } } }))?.value ?? null;
}
async function setValue(orgId: string, key: string, value: string): Promise<void> {
  await prisma.orgSetting.upsert({ where: { organizationId_key: { organizationId: orgId, key } }, create: { organizationId: orgId, key, value }, update: { value } });
}

export async function lastSentAt(orgId: string, mail: string, clientId: string): Promise<number | null> {
  try {
    const v = Number(await getValue(orgId, lastSentKey(mail, clientId)));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null; // cannot tell → send now (never lose an email)
  }
}

export async function markSent(orgId: string, mail: string, clientId: string, now = Date.now()): Promise<void> {
  try { await setValue(orgId, lastSentKey(mail, clientId), String(now)); } catch { /* worst case: the next one is not grouped */ }
}

/** True when this email must be held: one of the same group went to this company within the window. */
export async function shouldHold(orgId: string, mail: string, clientId: string | null | undefined, now = Date.now()): Promise<boolean> {
  if (!clientId) return false;
  return burstHeld(await lastSentAt(orgId, mail, clientId), now, BURST_WINDOW_MS);
}

/** Store a held email. Returns false when it could not be stored (the caller then sends it now). */
export async function hold(orgId: string, ev: HeldEvent): Promise<boolean> {
  try {
    await setValue(orgId, heldKey(ev.mail, ev.clientId, ev.id), JSON.stringify(ev));
    return true;
  } catch {
    return false;
  }
}

type Sender = (to: string, subject: string, html: string, cta: { href: string; label: string }, mail: PubMail, audience: "client" | "internal", key: string) => Promise<boolean>;
type ReadySender = (itemIds: string[], who: string) => Promise<boolean>;

/** Send every held group whose window is over, as one email per (group, company, recipient). */
export async function flushHeld(orgId: string, send: Sender, sendReady: ReadySender, now = Date.now()): Promise<number> {
  const rows = await prisma.orgSetting.findMany({ where: { organizationId: orgId, key: { startsWith: HELD_PREFIX } }, select: { key: true, value: true } });
  const keyOf = new Map<string, string>();
  const events: HeldEvent[] = [];
  for (const r of rows) {
    const e = parseHeld(r.value);
    if (!e) { await prisma.orgSetting.deleteMany({ where: { organizationId: orgId, key: r.key } }).catch(() => null); continue; }
    keyOf.set(e.id, r.key);
    events.push(e);
  }
  let sent = 0;
  for (const group of groupHeld(events)) {
    const first = group[0];
    if (!flushDue(await lastSentAt(orgId, first.mail, first.clientId), now)) continue;
    let ok: boolean;
    if (first.mail === "READY_FOR_PUBLISHING") {
      const ids = Array.from(new Set(group.flatMap((e) => e.itemIds || [])));
      ok = await sendReady(ids, Array.from(new Set(group.map((e) => e.who || "Client"))).join(", "));
    } else {
      const c = combineHeld(group);
      const mail = c.mail as PubMail;
      ok = await send(first.to, c.subject, c.html, first.cta, mail, first.audience,
        mailIdempotencyKey(PUBLISH_MAILS[mail].no, now, [orgId, first.clientId, first.to, "held", c.idParts]));
    }
    if (!ok) continue; // kept: the next sweep tries again
    sent++;
    await markSent(orgId, first.mail, first.clientId, now);
    await prisma.orgSetting.deleteMany({ where: { organizationId: orgId, key: { in: group.map((e) => keyOf.get(e.id)!).filter(Boolean) } } }).catch(() => null);
  }
  return sent;
}
