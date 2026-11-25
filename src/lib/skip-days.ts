/** v0.28.0 — DB side of skip-days-model: days a company's deleted posts left empty on purpose. */
import prisma from "@/lib/db-raw";
import { addSkipDays, parseSkipDays, removeSkipDays, skipKey } from "@/lib/skip-days-model";

function nyYmd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export async function skipDaysOf(orgId: string, clientId: string): Promise<Set<string>> {
  const r = await prisma.orgSetting.findUnique({ where: { organizationId_key: { organizationId: orgId, key: skipKey(clientId) } } }).catch(() => null);
  return new Set(parseSkipDays(r?.value));
}

async function save(orgId: string, clientId: string, days: string[]): Promise<void> {
  const key = skipKey(clientId);
  const value = JSON.stringify(days);
  await prisma.orgSetting.upsert({ where: { organizationId_key: { organizationId: orgId, key } }, create: { organizationId: orgId, key, value }, update: { value } });
}

/** The team deleted a planned post: keep its day empty (Autopilot / Fill the gap skip it). */
export async function keepDayEmpty(orgId: string, clientId: string, scheduledAt: Date): Promise<string> {
  const day = nyYmd(scheduledAt);
  const cur = [...(await skipDaysOf(orgId, clientId))];
  await save(orgId, clientId, addSkipDays(cur, [day], nyYmd(new Date())));
  return day;
}

/** Let Autopilot / Fill the gap plan these days again. */
export async function releaseDays(orgId: string, clientId: string, days: string[]): Promise<void> {
  const cur = [...(await skipDaysOf(orgId, clientId))];
  await save(orgId, clientId, removeSkipDays(cur, days));
}
