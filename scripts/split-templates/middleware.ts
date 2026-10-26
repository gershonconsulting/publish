/**
 * The front door of __PRODUCT_NAME__ (__HOST__) — an INTERNAL Gershon platform.
 *
 * Three-platform split, phase 1 (2026-10-26, see THREE-PLATFORM-SPLIT.md):
 * Publish and Social Tracking are for the Gershon team only. Being signed in
 * is not enough: the account must belong to the primary (Gershon Consulting)
 * workspace. A client who is an admin of their own Social workspace is refused
 * here, on pages AND on the API — hiding the menu is not a control.
 *
 * Open without a session:
 *   - sign-in (/login, /api/auth/*)
__OPEN_DOC__
 *
 * Everything else: signed in + member of the primary workspace, or 401/redirect.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { neon } from "@neondatabase/serverless";

/** Pages and API prefixes that do not need a Gershon session. */
const OPEN_PAGES = ["/login", __OPEN_PAGES__];
const OPEN_API = ["/api/auth/", "/api/ping", __OPEN_API__];

function startsWithAny(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(p + "/")));
}

/** id of the primary (Gershon Consulting) organization, cached per isolate. */
let primaryOrgId: string | null = null;
let primaryCheckedAt = 0;

async function getPrimaryOrgId(): Promise<string | null> {
  if (primaryOrgId && Date.now() - primaryCheckedAt < 10 * 60 * 1000) return primaryOrgId;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    const sql = neon(url) as unknown as (t: string, p: unknown[]) => Promise<{ id: string }[]>;
    const rows = await sql(`SELECT id FROM organizations WHERE "isPrimary" = true ORDER BY "createdAt" ASC LIMIT 1`, []);
    primaryOrgId = rows[0]?.id ?? null;
    primaryCheckedAt = Date.now();
    return primaryOrgId;
  } catch {
    return null;
  }
}

/** The organization a user belongs to — read fresh, the token may predate a move. */
async function getUserOrgId(userId: string): Promise<string | null> {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    const sql = neon(url) as unknown as (t: string, p: unknown[]) => Promise<{ organizationId: string | null; pendingApproval: boolean }[]>;
    const rows = await sql(`SELECT "organizationId", "pendingApproval" FROM users WHERE id = $1 LIMIT 1`, [userId]);
    const r = rows[0];
    if (!r || r.pendingApproval) return null;
    return r.organizationId;
  } catch {
    return null;
  }
}

function deny(req: NextRequest, status: 401 | 403, reason: string) {
  const isApi = req.nextUrl.pathname.startsWith("/api/");
  if (isApi) return NextResponse.json({ success: false, error: reason }, { status });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = status === 403 ? "?error=internal_only" : "";
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (startsWithAny(pathname, OPEN_API)) return NextResponse.next();
  if (!pathname.startsWith("/api/") && startsWithAny(pathname, OPEN_PAGES)) return NextResponse.next();
  // Static files served from /public.
  if (/\.(png|svg|ico|jpg|jpeg|webp|txt|xml|json|zip)$/.test(pathname)) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET as string });
  if (!token?.id) return deny(req, 401, "Not signed in");

  // Fail closed: if the primary workspace or the user's workspace can't be
  // read, nobody gets in.
  const [primary, userOrg] = await Promise.all([getPrimaryOrgId(), getUserOrgId(String(token.id))]);
  if (!primary || !userOrg || userOrg !== primary) {
    return deny(req, 403, "__PRODUCT_NAME__ is for the Gershon team only");
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
