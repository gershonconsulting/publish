// Publish's own Summary (v0.6.0). Client-side; see page-client.
import { SummaryClient } from "./page-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default function SummaryPage() {
  return <SummaryClient />;
}
