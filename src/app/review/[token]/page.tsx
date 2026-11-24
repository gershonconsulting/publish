// The client's review portal (v4.37.0). Public: the private token in the URL
// is the access (see /api/review/[token]). Client-side; see page-client.
import type { Metadata } from "next";
import { ReviewClient } from "./page-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Content review", robots: { index: false, follow: false } };

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await params;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || null;
  // v0.25.1: ?batch=<name> / ?post=<id> — the posts the email was about.
  return <ReviewClient token={token} focusBatch={one(sp.batch)} focusPost={one(sp.post)} />;
}
