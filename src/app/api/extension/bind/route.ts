export const runtime = "edge";
/**
 * GET /api/extension/bind — how the Publish extension learns which workspace
 * it publishes for, without anybody pasting anything. (Publish v0.6.0, ported
 * from Social.)
 *
 * The extension's content script (gx-bridge.js) runs on publish.gershon.ai
 * pages and calls this with the page's own sign-in cookie. The middleware has
 * already checked the session AND that the account belongs to the Gershon
 * workspace (Publish is internal), so the token handed back is always the
 * primary workspace's. Same token as Social's extension (OrgSetting
 * "extension_token") — one workspace, one credential.
 *
 * Viewing-only accounts get no token: publishing WRITES.
 */
import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/db-raw";
import { getOrCreateExtensionToken } from "@/lib/extension-auth";
import { primaryOrgId } from "@/lib/publish-extension-caller";

export async function GET() {
  try {
    const session = await getSession();
    const user = session?.user;
    if (!user?.id) return NextResponse.json({ success: false, error: "Not signed in" }, { status: 401 });
    if (user.role === UserRole.READ_ONLY) {
      return NextResponse.json({ success: false, error: "Viewing-only accounts can't publish" }, { status: 403 });
    }
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, organization: { select: { id: true, name: true } } },
    });
    const org = row?.organization;
    if (!org) return NextResponse.json({ success: false, error: "Your account isn't attached to a workspace yet." }, { status: 409 });
    if (org.id !== (await primaryOrgId())) {
      return NextResponse.json({ success: false, error: "Publish is for the Gershon team only" }, { status: 403 });
    }
    const token = await getOrCreateExtensionToken(org.id);
    return NextResponse.json(
      { success: true, data: { token, workspaceId: org.id, workspaceName: org.name, email: row?.email ?? user.email ?? null } },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
