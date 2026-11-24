/**
 * v0.25.0 — weekly feature-status email (PUB-217). Every Monday (New York) the
 * daily cron emails social@gershonconsulting.com (env FEATURE_STATUS_TO overrides)
 * the status of every Publish feature: 🔴 started, 🟠 pending validation, 🟢 done.
 * Source: feature-status-data.ts (kept current with each release). No schema change.
 */
import prisma from "@/lib/db-raw";
import { sendMail } from "@/lib/publishing";
import { publishLink } from "@/lib/publishing-mail";
import { mailIdempotencyKey } from "@/lib/mail-dedupe";
import { weekRange, weeklyDue } from "@/lib/conn-report-model";
import { FEATURES } from "@/lib/feature-status-data";
import { featureCounts, featureStatusHtml, featureStatusSubject } from "@/lib/feature-status-model";

export const FEATURE_STATUS_TO = "social@gershonconsulting.com";
const STAMP = "feature_status_week";

export function buildFeatureStatus(now = Date.now()) {
  const { label } = weekRange(now);
  return { label, subject: featureStatusSubject(FEATURES, label, now), html: featureStatusHtml(FEATURES, label, now), counts: featureCounts(FEATURES, now) };
}

/** Monday once (or forced): build and send. */
export async function weeklyFeatureStatus(orgId: string, now = Date.now(), force = false): Promise<{ sent: boolean; skipped?: string }> {
  const row = await prisma.orgSetting.findUnique({ where: { organizationId_key: { organizationId: orgId, key: STAMP } } });
  const due = weeklyDue(now, row?.value ?? null);
  if (!force && !due.due) return { sent: false, skipped: "not this week's send day" };
  const r = buildFeatureStatus(now);
  const to = (process.env.FEATURE_STATUS_TO || "").trim() || FEATURE_STATUS_TO;
  const sent = await sendMail(to, r.subject, r.html, { href: publishLink("/publishing"), label: "Open Publish" }, "FEATURE_WEEKLY", "internal",
    { idempotencyKey: force ? undefined : mailIdempotencyKey("PUB-217", now, [orgId, due.key]) });
  if (sent && !force) {
    await prisma.orgSetting.upsert({
      where: { organizationId_key: { organizationId: orgId, key: STAMP } },
      create: { organizationId: orgId, key: STAMP, value: due.key },
      update: { value: due.key },
    });
  }
  return { sent };
}
