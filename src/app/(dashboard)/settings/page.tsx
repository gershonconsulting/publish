// v0.9.0 — Publish's own Settings page (Olivier, 2026-10-28: "it's also missing a
// Settings menu"). Old return addresses (/settings?… from the header's
// "Workspace", LinkedIn/X OAuth) still land on Connections, as in v0.7.1.
import { redirect } from "next/navigation";
import { SettingsClient } from "./page-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && k !== "client") q.set(k, v);
  const qs = q.toString();
  if (qs) redirect(`/publishing/accounts?${qs}`);
  return <SettingsClient />;
}
