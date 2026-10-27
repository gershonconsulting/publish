// v0.7.1 — Publish has no Settings page of its own; old links (/settings, the
// header's "Workspace", LinkedIn/X return addresses) land on Connections.
import { redirect } from "next/navigation";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function SettingsRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") q.set(k, v);
  const qs = q.toString();
  redirect(`/publishing/accounts${qs ? `?${qs}` : ""}`);
}
