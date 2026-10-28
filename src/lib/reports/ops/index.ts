/**
 * The three operations reports next to the daily Collection report.
 * One entry point to build, render and send each of them.
 */
import { primaryOrgId } from "../monthly/data";
import { buildPostingReport, renderPosting, postingSubject } from "./posting";
import { buildContentReport, renderContent, contentSubject, type ContentReport } from "./content";
import { buildCompetitiveReport, renderCompetitive, competitiveSubject } from "./competitive";
import { buildIntelligenceReport, renderIntelligence, intelligenceSubject, INTEL_TO } from "./intelligence";
import { criticalUnchanged, saveCritical } from "@/lib/alert-dedupe";
import { orgAlertStore } from "@/lib/publishing";
import { deliver, type DeliveryResult, type OpsKind } from "./shell";

export const OPS_KINDS: OpsKind[] = ["posting", "content", "competitive", "intelligence"];

/** Who each report goes to by default: everything to report@, Intelligence to sales@. */
export function defaultTo(kind: OpsKind): string | undefined {
  return kind === "intelligence" ? process.env.INTEL_REPORT_TO || INTEL_TO : undefined;
}

export type Built = { kind: OpsKind; dayKey: string; subject: string; html: string; data: unknown };

export async function buildOps(kind: OpsKind, orgId?: string, opts: { refresh?: boolean } = {}): Promise<Built> {
  const org = orgId || (await primaryOrgId());
  if (kind === "posting") {
    const r = await buildPostingReport(org);
    return { kind, dayKey: r.dayKey, subject: postingSubject(r), html: renderPosting(r), data: r };
  }
  if (kind === "content") {
    const r = await buildContentReport(org);
    return { kind, dayKey: r.dayKey, subject: contentSubject(r), html: renderContent(r), data: r };
  }
  if (kind === "intelligence") {
    const r = await buildIntelligenceReport(org, opts);
    return { kind, dayKey: r.dayKey, subject: intelligenceSubject(r), html: renderIntelligence(r), data: r };
  }
  const r = await buildCompetitiveReport(org);
  return { kind, dayKey: r.dayKey, subject: competitiveSubject(r), html: renderCompetitive(r), data: r };
}

/** Build and send the given reports (all three by default). One failure never stops the others. */
export async function sendOps(opts: { kinds?: OpsKind[]; force?: boolean; to?: string } = {}): Promise<Array<DeliveryResult | { kind: OpsKind; sent: false; error: string }>> {
  const org = await primaryOrgId();
  const out: Array<DeliveryResult | { kind: OpsKind; sent: false; error: string }> = [];
  for (const kind of opts.kinds || OPS_KINDS) {
    try {
      let b = await buildOps(kind, org);
      // v0.6.1: Content report — "under half a week" in full only when the set of companies changed.
      let critIds: string[] | null = null;
      if (kind === "content") {
        const r = b.data as ContentReport;
        critIds = r.rows.filter((x) => x.level === "critical").map((x) => x.clientId);
        if (await criticalUnchanged(orgAlertStore(org), "ops", critIds)) b = { ...b, subject: contentSubject(r, { unchanged: true }), html: renderContent(r, { unchanged: true }) };
      }
      const res = await deliver(kind, b.dayKey, b.subject, b.html, { force: opts.force, to: opts.to, defaultTo: defaultTo(kind) });
      if (critIds && res.sent) await saveCritical(orgAlertStore(org), "ops", critIds);
      out.push(res);
    } catch (e) {
      out.push({ kind, sent: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

export function isOpsKind(v: string | null): v is OpsKind {
  return !!v && (OPS_KINDS as string[]).includes(v);
}
