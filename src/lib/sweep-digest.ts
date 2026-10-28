/**
 * v0.7.5 — ONE internal email per sweep run (PUB-212).
 *
 * Audit 2026-10-23 → 10-27: every day at 15:30Z the team got four near-identical
 * "[PUB-205/207/209] A X post did not go out" emails (one per company —
 * PuenteLatin, LINALYSIS, Gershon Consulting, AmericanAbroad: the publishing
 * Chrome is only signed in to X as @oattia), plus separate PUB-207 failures and
 * four "LinkedIn signed out" alerts. Now a sweep collects everything that did
 * not go out — missed (PUB-205), stuck (PUB-206), failed in the Chrome
 * extension (PUB-207) or through a connected account (PUB-208) — and every
 * network sign-out (PUB-209) into one table: company, network, reason, direct
 * link. Each post is still reported once (alert-dedupe.ts ledger).
 *
 * Also: the daily content inventory (PUB-201) is sent only when its state
 * changed since the last one sent (`inventorySig`, key `content_inventory_sig:<scope>`
 * in the existing org_settings table — no migration).
 *
 * Pure functions only, so they are unit-testable (tests/sweep-digest.test.mts).
 */
import type { AlertStore } from "@/lib/alert-dedupe"; // type-only: erased at runtime

export type DigestKind = "missed" | "stuck" | "failed" | "signed_out";

export type DigestEntry = {
  kind: DigestKind;
  /** Company name(s); for a sign-out of the shared browser, the companies with posts on hold. */
  company: string;
  /** "X" / "LinkedIn". */
  network: string;
  reason: string;
  /** Direct link into publish.gershon.ai. */
  link: string;
  /** Scheduled time (already formatted) for a post; sign-out time for a sign-out. */
  when?: string;
  /** First line of the post, for posts. */
  excerpt?: string;
  /** Scheduled posts waiting, for a sign-out. */
  pending?: number;
};

const KIND_LABEL: Record<DigestKind, string> = {
  missed: "Not published in time",
  stuck: "Started, never reported back",
  failed: "Failed to publish",
  signed_out: "Signed out — posts on hold",
};

function escHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

export function digestSubject(entries: DigestEntry[]): string {
  const posts = entries.filter((e) => e.kind !== "signed_out").length;
  const outs = entries.filter((e) => e.kind === "signed_out");
  const nets = [...new Set(outs.map((e) => e.network))].join(" + ");
  const held = outs.reduce((n, e) => n + (e.pending || 0), 0);
  if (posts) return `${posts} post${posts === 1 ? "" : "s"} did not go out today${outs.length ? ` — ${nets} signed out` : ""}`;
  return `${nets} signed out — ${held} scheduled post${held === 1 ? " is" : "s are"} on hold`;
}

/** Posts first (by company, then network), then sign-outs. */
export function sortEntries(entries: DigestEntry[]): DigestEntry[] {
  const rank = (e: DigestEntry) => (e.kind === "signed_out" ? 1 : 0);
  return [...entries].sort((a, b) => rank(a) - rank(b) || a.company.localeCompare(b.company) || a.network.localeCompare(b.network));
}

export const DIGEST_MAX_ROWS = 60;

export function digestHtml(entries: DigestEntry[]): string {
  const td = "padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top";
  const list = sortEntries(entries);
  const rows = list.slice(0, DIGEST_MAX_ROWS).map((e) => {
    const what = `<b>${escHtml(KIND_LABEL[e.kind])}</b>${e.when ? `<br><span style="color:#666;font-size:12px">${escHtml(e.when)}</span>` : ""}`;
    const detail = [
      e.excerpt ? `<i style="color:#555">“${escHtml(e.excerpt)}”</i>` : "",
      e.pending != null ? `${e.pending} scheduled post${e.pending === 1 ? "" : "s"} waiting` : "",
      escHtml(e.reason),
    ].filter(Boolean).join("<br>");
    return `<tr><td style="${td}"><b>${escHtml(e.company)}</b></td><td style="${td}">${escHtml(e.network)}</td><td style="${td}">${what}</td>
      <td style="${td}">${detail}</td><td style="${td};white-space:nowrap"><a href="${escHtml(e.link)}" style="color:#b91c1c;font-weight:bold;text-decoration:none">Open →</a></td></tr>`;
  });
  const th = "text-align:left;padding:6px 8px;border-bottom:2px solid #ddd;font-size:12px;color:#555";
  const posts = list.filter((e) => e.kind !== "signed_out").length;
  const outs = list.length - posts;
  return `<p>${posts ? `<b>${posts} post${posts === 1 ? "" : "s"} did not go out</b>` : "Nothing failed"}${outs ? `, and <b>${outs} publishing sign-in${outs === 1 ? "" : "s"}</b> need${outs === 1 ? "s" : ""} attention` : ""}:</p>
    <table style="border-collapse:collapse;font-size:13px"><tr><th style="${th}">Company</th><th style="${th}">Network</th><th style="${th}">What happened</th><th style="${th}">Reason</th><th style="${th}"></th></tr>${rows.join("")}</table>
    ${list.length > DIGEST_MAX_ROWS ? `<p>…and ${list.length - DIGEST_MAX_ROWS} more in the calendar.</p>` : ""}
    <p style="color:#666;font-size:12px">One email per check. Each post is reported once — again only if it fails again after a Retry, or after 7 days. A sign-out is reported once per sign-out.</p>`;
}

// ── Content inventory (PUB-201): send only on change ─────────────────────────

export type InventoryState = { clientId: string; level: string; overdueReviews?: number; overdueChanges?: number };

/**
 * The state the team acts on: which companies need attention and how
 * (level + overdue flags). Exact post counts are left out on purpose — they
 * move every day as posts go out, which is what made the same alert repeat.
 */
export function inventorySig(rows: InventoryState[]): string {
  return rows
    .map((r) => `${r.clientId}:${r.level}:${r.overdueReviews ? "R" : ""}${r.overdueChanges ? "C" : ""}`)
    .sort()
    .join(",");
}

export const INVENTORY_SIG_KEY = (scope: string) => `content_inventory_sig:${scope}`;

/** True when the inventory state differs from the last one SENT (or nothing was sent yet). */
export async function inventoryChanged(store: AlertStore, scope: string, sig: string): Promise<boolean> {
  try {
    return (await store.get(INVENTORY_SIG_KEY(scope))) !== sig;
  } catch {
    return true; // cannot tell: send rather than go silent
  }
}

export async function saveInventorySig(store: AlertStore, scope: string, sig: string): Promise<void> {
  try {
    await store.set(INVENTORY_SIG_KEY(scope), sig);
  } catch { /* worst case: one extra email */ }
}
