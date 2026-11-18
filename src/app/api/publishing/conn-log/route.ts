export const runtime = "edge";
/**
 * GET /api/publishing/conn-log?clientId=… — v0.20.0 connection history of one company:
 *   events (newest first), state now per network, and the last post that went out
 *   through each direct connection (evidence of when it last worked).
 * GET /api/publishing/conn-log — every company: its latest event per network.
 * Reading also brings the log up to date (an expiry nobody saved gets its event).
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db-raw";
import { publishingCaller } from "@/lib/publishing-auth";
import { PUBLISHING_CLIENT_WHERE } from "@/lib/publishing";
import { getLinked } from "@/lib/linked-accounts";
import { syncConnLog } from "@/lib/conn-log";
import { describe, netState, type ConnEvent, type LogNet } from "@/lib/conn-log-model";

const view = (e: ConnEvent) => ({ ...e, text: describe(e) });

export async function GET(req: NextRequest) {
  const c = await publishingCaller(false);
  if (c instanceof NextResponse) return c;
  const clientId = new URL(req.url).searchParams.get("clientId");
  const clients = await prisma.client.findMany({
    where: { organizationId: c.orgId, archivedAt: null, status: { not: "ARCHIVED" }, ...PUBLISHING_CLIENT_WHERE, ...(clientId ? { id: clientId } : {}) },
    select: { id: true, name: true, clientType: true },
    orderBy: { name: "asc" },
  });
  if (clientId && !clients.length) return NextResponse.json({ success: false, error: "Unknown company." }, { status: 400 });

  const rows = [];
  for (const cl of clients) {
    const l = await getLinked(c.orgId, cl.id);
    const events = await syncConnLog(c.orgId, cl.id, l);
    const now: Record<LogNet, unknown> = { linkedin: null, x: null };
    const last: Record<LogNet, unknown> = { linkedin: null, x: null };
    for (const net of ["linkedin", "x"] as LogNet[]) {
      const s = netState(l, net);
      now[net] = { status: s.status, as: s.as, personal: s.personal, error: s.error, expiry: s.expiry };
      const mine = events.filter((e) => e.net === net);
      last[net] = mine.length ? view(mine[mine.length - 1]) : null;
    }
    const row: Record<string, unknown> = { id: cl.id, name: cl.name, clientType: cl.clientType, now, last };
    if (clientId) {
      row.events = events.slice().reverse().map(view);
      const ev = async (platform: string, ok: boolean) => prisma.scheduledPost.findFirst({
        where: { organizationId: c.orgId, clientId: cl.id, platform, ...(ok ? { status: "POSTED", verifiedVia: "api" } : { status: { in: ["FAILED", "MISSED"] } }) },
        orderBy: ok ? { postedAt: "desc" } : { updatedAt: "desc" },
        select: { postedAt: true, updatedAt: true, postUrl: true, lastError: true },
      });
      const [liOk, xOk, liBad, xBad] = await Promise.all([ev("LINKEDIN", true), ev("TWITTER", true), ev("LINKEDIN", false), ev("TWITTER", false)]);
      const ok = (p: typeof liOk) => (p ? { at: (p.postedAt ?? p.updatedAt).toISOString(), url: p.postUrl } : null);
      const bad = (p: typeof liBad) => (p ? { at: p.updatedAt.toISOString(), error: p.lastError } : null);
      row.evidence = { linkedin: { lastApiPost: ok(liOk), lastFailure: bad(liBad) }, x: { lastApiPost: ok(xOk), lastFailure: bad(xBad) } };
    }
    rows.push(row);
  }
  return NextResponse.json({ success: true, data: clientId ? rows[0] : rows });
}
