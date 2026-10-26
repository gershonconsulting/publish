export const runtime = "edge";
import { PRODUCT_NAME, PRODUCT_VERSION } from "@/lib/product";
import { SITE_HOST } from "@/lib/site";

/** Public liveness check: which product answered, and which build. */
export async function GET() {
  return Response.json({
    ok: true,
    product: PRODUCT_NAME,
    host: SITE_HOST,
    version: PRODUCT_VERSION,
    build: process.env.NEXT_PUBLIC_BUILD_NUMBER || null,
    commit: (process.env.NEXT_PUBLIC_APP_VERSION || "").slice(0, 7) || null,
  });
}
