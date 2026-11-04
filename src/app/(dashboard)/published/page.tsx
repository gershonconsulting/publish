// Published — daily view (v0.12.0). Client-side; see page-client.
import { PublishedClient } from "./page-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default function PublishedPage() {
  return <PublishedClient />;
}
