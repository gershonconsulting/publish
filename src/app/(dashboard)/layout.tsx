export const runtime = 'edge';
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { ViewFiltersProvider } from "@/lib/view-filters";
import { ApiRetry } from "@/components/layout/api-retry";
import { PRODUCT_NAME, PRODUCT_VERSION } from "@/lib/product";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "dev";
const BUILD_DATE = process.env.NEXT_PUBLIC_BUILD_DATE || new Date().toISOString();
const BUILD_NUMBER = process.env.NEXT_PUBLIC_BUILD_NUMBER || "";

function formatBuildDate(raw: string): string {
  try {
    return new Date(raw).toLocaleString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
      timeZone: "America/New_York", timeZoneName: "short",
    });
  } catch {
    return raw;
  }
}

/**
 * Split from Social on 2026-10-26. Unlike Social's layout this one runs NO
 * one-shot data migrations or backfills: those have exactly one owner (Social)
 * and must never run from three apps. The middleware has already checked that
 * the visitor belongs to the Gershon workspace.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const shortSha = APP_VERSION.length > 8 ? APP_VERSION.slice(0, 7) : APP_VERSION;
  return (
    <ViewFiltersProvider>
      <ApiRetry />
      <div className="flex h-screen overflow-hidden bg-[#F5F4F0]">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1400px] mx-auto px-9 pt-7 pb-10">
            {children}
            <footer className="mt-12 pt-4 border-t border-gray-200 text-[11px] text-gray-500 font-mono">
              {PRODUCT_NAME} v{PRODUCT_VERSION}
              {BUILD_NUMBER && <> &middot; Build #{BUILD_NUMBER}</>} &middot; {shortSha} &middot; {formatBuildDate(BUILD_DATE)}
            </footer>
          </div>
        </main>
      </div>
    </ViewFiltersProvider>
  );
}
