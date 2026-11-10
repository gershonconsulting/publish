// v0.14.0 — a person connects their own LinkedIn profile to Publish. Public: the gl_ token in the URL is the access.
import type { Metadata } from "next";
import { LiConnectClient } from "./page-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connect your LinkedIn profile", robots: { index: false, follow: false } };

export default async function LiConnectPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <LiConnectClient token={token} />;
}
