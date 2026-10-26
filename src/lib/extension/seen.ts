/**
 * Publish extension presence heartbeat — storage + comparison helpers.
 * (Publish v0.6.0: own key, PUBLISH_PING/PUBLISH_PONG bridge.)
 *
 * Lives in lib/ (not in the route) because Next.js route modules may only
 * export HTTP verbs, and both /api/extension/seen and the daily progress
 * report need these.
 *
 * The Publish extension announces itself on every publish.gershon.ai page
 * (content.js posts PUBLISH_HELLO and answers PUBLISH_PING with PUBLISH_PONG,
 * both carrying chrome.runtime.getManifest().version). The banner in the
 * shared layout (components/layout/publish-extension-banner.tsx) forwards
 * that version to /api/extension/seen, which records it here — in the
 * settings table, so no schema change:
 *
 *   settings["publish_ext_installed"] = { version, lastSeenAt, firstSeenAt, previous }
 */

import prisma from "@/lib/db";

/**
 * Publish's own key (v0.6.0). Social keeps "ext_installed" for ITS extension;
 * the two must never overwrite each other in the shared settings table.
 */
export const EXT_SEEN_KEY = "publish_ext_installed";

export interface ExtSeen {
  version: string;
  lastSeenAt: string;
  firstSeenAt: string;
  previous: string | null;
}

/** Numeric dot-segment compare — the same rule the extension popup uses. */
export function semverLt(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

export async function readExtSeen(): Promise<ExtSeen | null> {
  const row = await prisma.setting.findUnique({ where: { key: EXT_SEEN_KEY } });
  if (!row?.value) return null;
  try {
    const p = JSON.parse(row.value) as Partial<ExtSeen>;
    if (!p || typeof p.version !== "string") return null;
    return {
      version: p.version,
      lastSeenAt: p.lastSeenAt ?? row.updatedAt.toISOString(),
      firstSeenAt: p.firstSeenAt ?? p.lastSeenAt ?? row.updatedAt.toISOString(),
      previous: p.previous ?? null,
    };
  } catch {
    return null;
  }
}

export async function recordExtSeen(version: string): Promise<ExtSeen> {
  const now = new Date().toISOString();
  const prior = await readExtSeen();
  const changed = prior !== null && prior.version !== version;

  const next: ExtSeen = {
    version,
    lastSeenAt: now,
    firstSeenAt: changed || !prior ? now : prior.firstSeenAt,
    previous: changed ? prior.version : (prior?.previous ?? null),
  };
  const value = JSON.stringify(next);
  await prisma.setting.upsert({
    where: { key: EXT_SEEN_KEY },
    update: { value },
    create: { key: EXT_SEEN_KEY, value },
  });
  return next;
}
