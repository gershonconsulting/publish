// Intelligence (v0.9.0) — Cloudflare Workers AI. Client-side; see page-client.
import { IntelligenceClient } from "./page-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default function IntelligencePage() {
  return <IntelligenceClient />;
}
