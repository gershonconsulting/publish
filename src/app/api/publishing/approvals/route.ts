export const runtime = "edge";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db-raw";
import { publishingCaller } from "@/lib/publishing-auth";
import { reviewUrl } from "@/lib/publishing";
import { APPROVAL_PREFIX, approvalInput, approvalRecord } from "@/lib/approval-links-model";

export async function GET(req: NextRequest) {
  const c = await publishingCaller(false);
  if (c instanceof NextResponse) return c;
  const sp = new URL(req.url).searchParams;
  if (sp.get("select") === "1") {
    const clientId = sp.get("clientId");
    // No status/date/take restriction: even old published posts are selectable.
    const [items, clients, org] = await Promise.all([
      prisma.contentItem.findMany({
        where: { organizationId: c.orgId, ...(clientId ? { clientId } : {}) },
        select: { id: true, title: true, text: true, status: true, clientId: true, createdAt: true },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      }),
      prisma.client.findMany({ where: { organizationId: c.orgId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.organization.findUnique({ where: { id: c.orgId }, select: { name: true } }),
    ]);
    return NextResponse.json({ success: true, data: { items, clients, workspace: org?.name || "Workspace" } });
  }
  const rows = await prisma.orgSetting.findMany({
    where: { organizationId: c.orgId, key: { startsWith: APPROVAL_PREFIX } },
    orderBy: { createdAt: "desc" },
  });
  const links = rows.flatMap((row) => {
    let value;
    try { value = JSON.parse(row.value); } catch { return []; }
    const record = approvalRecord.safeParse(value);
    if (!record.success) return [];
    const a = record.data;
    if (sp.get("clientId") && a.clientId !== sp.get("clientId")) return [];
    return [{ token: row.key.slice(APPROVAL_PREFIX.length), name: a.name, clientId: a.clientId,
      scopeName: a.scopeName, createdAt: a.createdAt, count: a.ids.length,
      url: reviewUrl(row.key.slice(APPROVAL_PREFIX.length)) }];
  });
  return NextResponse.json({ success: true, data: { links, canWrite: c.canWrite } });
}

export async function POST(req: NextRequest) {
  const c = await publishingCaller(true);
  if (c instanceof NextResponse) return c;
  const parsed = approvalInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  const b = parsed.data;
  const [items, client, org] = await Promise.all([
    prisma.contentItem.findMany({
      where: { organizationId: c.orgId, ...(b.clientId ? { clientId: b.clientId } : {}), id: { in: b.ids } },
      select: { id: true },
    }),
    b.clientId ? prisma.client.findFirst({ where: { id: b.clientId, organizationId: c.orgId }, select: { name: true } }) : null,
    prisma.organization.findUnique({ where: { id: c.orgId }, select: { name: true } }),
  ]);
  if (items.length !== b.ids.length || (b.clientId && !client)) {
    return NextResponse.json({ success: false, error: "Some selected posts are no longer available in this scope. Refresh and try again." }, { status: 400 });
  }
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = "ga_" + Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");
  const record = { ...b, scopeName: client?.name || org?.name || "Workspace", createdAt: new Date().toISOString(), createdBy: c.name };
  // One immutable record per request, using the existing workspace settings store.
  // Creating a link never submits, approves, edits, or emails its posts.
  await prisma.orgSetting.create({ data: { organizationId: c.orgId, key: APPROVAL_PREFIX + token, value: JSON.stringify(record) } });
  return NextResponse.json({ success: true, data: { token, url: reviewUrl(token) } }, { status: 201 });
}
