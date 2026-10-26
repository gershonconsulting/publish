// /extension — Publish's own Chrome extension (v0.6.0). Client-side; see page-client.
import { ExtensionClient } from "./page-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default function ExtensionPage() {
  return <ExtensionClient />;
}
