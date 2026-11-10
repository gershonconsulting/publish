// Knowledge validation (v0.16.0). Public: the private token in the URL is the
// access (see /api/kb-review/[token]). Client-side; see page-client.
import type { Metadata } from "next";
import { KbReviewClient } from "./page-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Knowledge review", robots: { index: false, follow: false } };

export default async function KbReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <KbReviewClient token={token} />;
}
