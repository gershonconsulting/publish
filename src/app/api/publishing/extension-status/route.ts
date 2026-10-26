export const runtime = "edge";
/**
 * GET /api/publishing/extension-status — for the /extension page (v0.6.0):
 * the publishing Chromes seen (Publish's own extension and, during the
 * transition, Social's), the last version seen in a Publish page, and the
 * last deliveries.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/db-raw";
import { publishingCaller } from "@/lib/publishing-auth";
import { listBrowsers } from "@/lib/publish-browsers";
import { browserView, publishCompanies } from "@/lib/publish-dashboard";
import { readExtSeen, semverLt } from "@/lib/extension/seen";
import { EXTENSION_LATEST, EXTENSION_NAME, EXTENSION_UNPACKED_FOLDER, EXTENSION_ZIP_NAME, EXTENSION_ZIP_URL } from "@/lib/extension-version";

export async function GET() {
  const c = await publishingCaller(false);
  if (c instanceof NextResponse) return c;
  const out: Record<string, unknown> = {
    latest: EXTENSION_LATEST, name: EXTENSION_NAME, zipName: EXTENSION_ZIP_NAME, zipUrl: EXTENSION_ZIP_URL, folder: EXTENSION_UNPACKED_FOLDER,
  };
  try {
    out.browsers = (await listBrowsers(c.orgId)).map((b) => browserView(b));
  } catch (e) {
    out.browsers = null;
    out.browsersError = e instanceof Error ? e.message : "unavailable";
  }
  try {
    const seen = await readExtSeen();
    out.seen = seen ? { ...seen, outOfDate: semverLt(seen.version, EXTENSION_LATEST) } : null;
  } catch {
    out.seen = undefined;
  }
  try {
    const companies = await publishCompanies(c.orgId);
    const names = new Map(companies.map((x) => [x.id, x.name]));
    const rows = await prisma.scheduledPost.findMany({
      where: { organizationId: c.orgId, clientId: { in: companies.map((x) => x.id) }, status: { in: ["POSTED", "FAILED", "MISSED"] } },
      orderBy: { updatedAt: "desc" },
      take: 15,
      select: { id: true, clientId: true, platform: true, status: true, postedAt: true, updatedAt: true, postUrl: true, verifiedAt: true, verifiedVia: true, lastError: true },
    });
    out.deliveries = rows.map((r) => ({
      id: r.id, company: (r.clientId && names.get(r.clientId)) || "—", clientId: r.clientId, platform: r.platform, status: r.status,
      at: (r.postedAt ?? r.updatedAt).toISOString(), postUrl: r.postUrl, verified: !!r.verifiedAt, verifiedVia: r.verifiedVia, error: r.lastError,
    }));
  } catch (e) {
    out.deliveries = null;
    out.deliveriesError = e instanceof Error ? e.message : "unavailable";
  }
  return NextResponse.json({ success: true, data: out }, { headers: { "cache-control": "no-store" } });
}
