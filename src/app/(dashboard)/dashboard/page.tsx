// Publish's own Dashboard (v0.6.0). Client-side; see page-client.
import { DashboardClient } from "./page-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return <DashboardClient />;
}
