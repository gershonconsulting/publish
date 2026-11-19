/**
 * v0.21.0 — weekly connections report (PUB-215). Every Monday (New York) the
 * daily cron emails report@gershonconsulting.com which companies have no direct
 * LinkedIn / X connection, an expired or broken one, one that posts somewhere
 * else, or one expiring within 14 days — plus the week's connection changes.
 * Logic in conn-report-model.ts (pure, tested). No schema change.
 */
import prisma from "@/lib/db-raw";
import { PUBLISHING_CLIENT_WHERE, esc, getTarget, sendMail } from "@/lib/publishing";
import { getLinked } from "@/lib/linked-accounts";
import { syncConnLog } from "@/lib/conn-log";
import { publishLink } from "@/lib/publishing-mail";
import { mailIdempotencyKey } from "@/lib/mail-dedupe";
import { connRow, counts, sortRows, weekRange, weeklyDue, type ConnReportRow } from "@/lib/conn-report-model";

/** Platform-report convention: every platform report goes to report@. */
export const CONN_REPORT_TO = "report@gershonconsulting.com";
const STAMP = "conn_report_week";

export async function buildConnReport(orgId: string, now = Date.now()): Promise<{ rows: ConnReportRow[]; label: string }> {
  const { since, label } = weekRange(now);
  const clients = await prisma.client.findMany({
    where: { organizationId: orgId, archivedAt: null, status: { not: "ARCHIVED" }, ...PUBLISHING_CLIENT_WHERE },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const rows: ConnReportRow[] = [];
  for (const cl of clients) {
    const [t, l] = await Promise.all([getTarget(orgId, cl.id), getLinked(orgId, cl.id)]);
    const events = await syncConnLog(orgId, cl.id, l).catch(() => []);
    rows.push(connRow({ clientId: cl.id, name: cl.name, linkedinUrl: t.linkedinUrl, xHandle: t.xHandle }, l, events, since, now));
  }
  return { rows: sortRows(rows), label };
}

const COLOR = { red: "#b91c1c", orange: "#b45309", ok: "#047857" } as const;
const DOT = { red: "🔴", orange: "🟠", ok: "🟢" } as const;

export function connReportHtml(rows: ConnReportRow[], label: string): string {
  const c = counts(rows);
  const gaps = rows.filter((r) => r.level !== "ok");
  const link = "color:#d11200;font-weight:bold;text-decoration:none";
  const tr = (r: ConnReportRow) => {
    const lines = r.lines.map((x) => `<div style="color:${COLOR[x.level]}">${DOT[x.level]} ${esc(x.text)}</div>`).join("");
    const ch = r.changes.length ? `<div style="margin-top:4px;font-size:12px;color:#555">This week: ${r.changes.map(esc).join(" · ")}</div>` : "";
    return `<tr><td style="padding:8px 10px;border-bottom:1px solid #eee;vertical-align:top"><b>${esc(r.name)}</b></td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee">${lines}${ch}
      <div style="margin-top:4px;font-size:13px"><a href="${publishLink("/publishing/accounts", { client: r.clientId })}" style="${link}">Open Connections →</a></div></td></tr>`;
  };
  const okNames = rows.filter((r) => r.level === "ok").map((r) => esc(r.name)).join(", ");
  return `<p><b>Week of ${esc(label)}</b> — ${c.total} compan${c.total === 1 ? "y" : "ies"} published by Publish:
      <b style="color:${COLOR.red}">${c.red} missing or broken</b> · <b style="color:${COLOR.orange}">${c.orange} to watch</b> · <b style="color:${COLOR.ok}">${c.ok} fully connected</b>.</p>
    <p>A company without a direct connection only publishes when a Chrome with the Publish extension, signed in to LinkedIn/X, is on —
      otherwise its posts are missed. Fix: Connections → <b>Allow</b> (company page / X) or send the person their connect link.</p>
    ${gaps.length ? `<table style="border-collapse:collapse;font-size:14px">${gaps.map(tr).join("")}</table>` : `<p style="color:${COLOR.ok}"><b>Every company is connected directly. Nothing to do.</b></p>`}
    ${okNames ? `<p style="color:#555;font-size:13px">Fully connected: ${okNames}.</p>` : ""}`;
}

export function connReportSubject(rows: ConnReportRow[], label: string): string {
  const c = counts(rows);
  const tail = c.red ? ` · ${c.red} compan${c.red === 1 ? "y" : "ies"} missing a connection` : c.orange ? ` · ${c.orange} to watch` : " · all connected";
  return `Publish Connections Report — ${label}${tail}`;
}

/** Monday once (or forced): build and send. Returns what happened. */
export async function weeklyConnReport(orgId: string, now = Date.now(), force = false): Promise<{ sent: boolean; skipped?: string; red?: number; orange?: number }> {
  const row = await prisma.orgSetting.findUnique({ where: { organizationId_key: { organizationId: orgId, key: STAMP } } });
  const due = weeklyDue(now, row?.value ?? null);
  if (!force && !due.due) return { sent: false, skipped: "not this week's send day" };
  const { rows, label } = await buildConnReport(orgId, now);
  if (!rows.length) return { sent: false, skipped: "no companies" };
  const to = (process.env.CONN_REPORT_TO || "").trim() || CONN_REPORT_TO;
  const sent = await sendMail(to, connReportSubject(rows, label), connReportHtml(rows, label),
    { href: publishLink("/publishing/accounts"), label: "Open all connections" }, "CONN_WEEKLY", "internal",
    { idempotencyKey: force ? undefined : mailIdempotencyKey("PUB-215", now, [orgId, due.key]) });
  if (sent && !force) {
    await prisma.orgSetting.upsert({
      where: { organizationId_key: { organizationId: orgId, key: STAMP } },
      create: { organizationId: orgId, key: STAMP, value: due.key },
      update: { value: due.key },
    });
  }
  const c = counts(rows);
  return { sent, red: c.red, orange: c.orange };
}
