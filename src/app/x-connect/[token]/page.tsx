// v0.8.1 — a client connects its own X account to Publish. Public: the gx_ token in the URL is the access.
import type { Metadata } from "next";
import { XConnectClient } from "./page-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connect your X account", robots: { index: false, follow: false } };

export default async function XConnectPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <XConnectClient token={token} />;
}
