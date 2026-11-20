/**
 * v0.23.1 — database side of lib/monthly-once.ts (org_settings, no migration).
 *   monthly_sent:<YYYY-MM>:<clientId>     → "pending:<ms>" / "sent:<ms>"
 *   client_announced:<itemId>@<version>#<pictures> → "<PUB-no>:<ms>"
 * The claim is an INSERT on the (organizationId, key) unique index, so two
 * concurrent Autopilot steps cannot both send; a stale "pending" claim (crash
 * mid-send) is taken over with a conditional update, like autopilot.ts takeRunLock.
 */
import prisma from "@/lib/db-raw";
import { STALE_CLAIM_MS, announcedKey, markerBlocks, pictureSig, type OnceStore } from "@/lib/monthly-once";

export function dbOnceStore(orgId: string): OnceStore {
  return {
    async claim(key, value, now) {
      try {
        await prisma.orgSetting.create({ data: { organizationId: orgId, key, value } });
        return true;
      } catch {
        /* exists (or DB error) → look at it */
      }
      const cur = await prisma.orgSetting
        .findUnique({ where: { organizationId_key: { organizationId: orgId, key } } })
        .catch(() => null);
      if (!cur) return false; // could not read it: never risk a second client email
      if (markerBlocks(cur.value, now, STALE_CLAIM_MS)) return false;
      const r = await prisma.orgSetting.updateMany({ where: { organizationId: orgId, key, value: cur.value }, data: { value } });
      return r.count === 1;
    },
    async confirm(key, value) {
      await prisma.orgSetting
        .upsert({ where: { organizationId_key: { organizationId: orgId, key } }, create: { organizationId: orgId, key, value }, update: { value } })
        .catch(() => null);
    },
    async release(key) {
      await prisma.orgSetting.deleteMany({ where: { organizationId: orgId, key } }).catch(() => null);
    },
  };
}

async function announcementKey(itemId: string, version: number): Promise<string> {
  const media = await prisma.contentMedia.findMany({ where: { contentId: itemId }, select: { id: true } }).catch(() => []);
  return announcedKey(itemId, version, pictureSig(media.map((m) => m.id)));
}

/**
 * Claims "the client is told about <item>@<version>". False when PUB-101/PUB-105
 * already announced that version → the caller does not email it again.
 */
export async function claimAnnouncement(orgId: string, itemId: string, version: number, no: string, now = Date.now()): Promise<boolean> {
  const key = await announcementKey(itemId, version);
  try {
    await prisma.orgSetting.create({ data: { organizationId: orgId, key, value: `${no}:${now}` } });
    return true;
  } catch {
    /* exists, or DB error → look */
  }
  const cur = await prisma.orgSetting
    .findUnique({ where: { organizationId_key: { organizationId: orgId, key } } })
    .then((r) => (r ? "found" : "missing"), () => "error");
  // Already announced → skip. Cannot tell (DB down) → send: the per-version
  // Resend Idempotency-Key of burstSend still stops a same-day repeat.
  return cur !== "found";
}

/** The announcement could not be sent → forget it so the next attempt may email. */
export async function releaseAnnouncement(orgId: string, itemId: string, version: number): Promise<void> {
  const key = await announcementKey(itemId, version);
  await prisma.orgSetting.deleteMany({ where: { organizationId: orgId, key } }).catch(() => null);
}
