"use client";
/**
 * Knowledge links (v0.23.0, Olivier 2026-11-19): "Complete the Knowledge Base
 * section for everyone, I want to share a dedicated link to all clients so they
 * can actually validate the content of these elements of knowledge about them."
 *
 * One line per company: its private client link (copy / open), which sections
 * are still empty, how far the client got. "Fill empty sections" drafts the
 * missing parts with Intelligence (never overwrites); "Open link" lets the
 * client in without waiting for the internal check.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, Loader2, RefreshCw, Sparkles, Unlock } from "lucide-react";

type Row = {
  clientId: string; name: string; clientType: string;
  sections: number; gaps: string[];
  internal: { url: string; ok: number; total: number; complete: boolean };
  client: { url: string; ok: number; changes: number; total: number; complete: boolean; open: boolean; releasedBy: string | null };
};

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.success) throw new Error(j?.error || `HTTP ${r.status}`);
  return j.data as T;
}

export function KnowledgeLinksClient() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await call<Row[]>("/api/knowledge-base/links")); } catch (e) { setErr(e instanceof Error ? e.message : "Could not load."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function fill(ids: string[]) {
    for (const id of ids) {
      setBusy(id);
      const gaps = rows?.find((r) => r.clientId === id)?.gaps || [];
      const errs: string[] = [];
      // "all" drafts every empty section; style and brand are retried alone so their reason (no history, no website) shows.
      const steps: Array<[string, string]> = [["all", "Draft"]];
      if (gaps.includes("Writing style")) steps.push(["style", "Writing style"]);
      if (gaps.includes("Brand identity")) steps.push(["brand", "Brand"]);
      for (const [section, label] of steps) {
        try {
          await call(`/api/knowledge-base/${id}`, { method: "POST", body: JSON.stringify({ section, overwrite: false }) });
        } catch (e) {
          errs.push(`${label}: ${e instanceof Error ? e.message : "could not draft."}`);
        }
      }
      setNotes((n) => ({ ...n, [id]: errs.join(" · ") }));
    }
    setBusy(null);
    await load();
  }
  async function release(target: string) {
    if (target === "all" && !confirm("Open the client link of every company that has knowledge to validate? Nothing is sent: you still send each link yourself.")) return;
    setBusy(target);
    try { setRows(await call<Row[]>("/api/knowledge-base/links", { method: "POST", body: JSON.stringify({ release: target }) })); } catch (e) { setErr(e instanceof Error ? e.message : "Could not open."); }
    setBusy(null);
  }
  async function copy(key: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000); } catch { window.prompt("Copy:", text); }
  }

  if (err && !rows) return <p className="p-6 text-sm text-red-700">{err} <button onClick={() => void load()} className="underline">Retry</button></p>;
  if (!rows) return <div className="p-6"><Loader2 className="animate-spin text-gray-400" /></div>;

  const withGaps = rows.filter((r) => r.gaps.length);
  const closed = rows.filter((r) => !r.client.open && r.sections > 0);
  const campaign = rows.filter((r) => r.clientType === "CAMPAIGN");
  const allText = campaign.map((r) => `${r.name}: ${r.client.url}`).join("\n");

  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Companies" value={rows.length} />
        <Tile label="Knowledge complete" value={rows.length - withGaps.length} tone={withGaps.length ? "warn" : "ok"} />
        <Tile label="Client link open" value={rows.filter((r) => r.client.open).length} />
        <Tile label="Validated by the client" value={rows.filter((r) => r.client.complete).length} tone="ok" />
      </div>

      <div className="flex flex-wrap gap-2">
        <button disabled={!!busy || !withGaps.length} onClick={() => void fill(withGaps.map((r) => r.clientId))} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-[#FE1B04] rounded-lg disabled:opacity-50">
          <Sparkles size={14} /> Fill empty sections ({withGaps.length})
        </button>
        <button disabled={!!busy || !closed.length} onClick={() => void release("all")} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-lg disabled:opacity-50">
          <Unlock size={14} /> Open every client link ({closed.length})
        </button>
        <button onClick={() => void copy("all", allText)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-lg">
          {copied === "all" ? <Check size={14} /> : <Copy size={14} />} Copy all client links
        </button>
        <button disabled={!!busy} onClick={() => void load()} className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>
      {err && <p className="text-xs text-red-700">{err}</p>}

      <table className="w-full text-sm">
        <thead className="text-left text-gray-500 text-xs">
          <tr><th className="py-2">Company</th><th>Still empty</th><th>Client validation</th><th>Client link</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.clientId} className="border-t border-gray-100 align-top">
              <td className="py-2 pr-3">
                <Link href={`/knowledge-base?client=${r.clientId}`} className="font-medium text-gray-900 hover:underline">{r.name}</Link>
                {r.clientType !== "CAMPAIGN" && <span className="ml-1.5 text-[10px] uppercase text-gray-400">internal</span>}
              </td>
              <td className="py-2 pr-3 text-xs">
                {r.gaps.length ? <span className="text-amber-800">{r.gaps.join(", ")}</span> : <span className="text-emerald-700">Nothing — complete</span>}
                {r.gaps.length > 0 && (
                  <button disabled={!!busy} onClick={() => void fill([r.clientId])} className="block mt-1 text-[11px] text-[#d11200] underline disabled:opacity-50">
                    {busy === r.clientId ? "Drafting…" : "Fill with Intelligence"}
                  </button>
                )}
                {notes[r.clientId] && <span className="block mt-1 text-[11px] text-red-700">{notes[r.clientId]}</span>}
              </td>
              <td className="py-2 pr-3 text-xs">
                {!r.client.open ? <span className="text-gray-500">Not open yet</span>
                  : r.client.complete ? <span className="text-emerald-700 font-semibold">All {r.client.total} confirmed</span>
                  : <span>{r.client.ok} of {r.client.total} confirmed{r.client.changes ? `, ${r.client.changes} with changes asked` : ""}</span>}
              </td>
              <td className="py-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.client.open ? (
                    <>
                      <button onClick={() => void copy(r.clientId, r.client.url)} className="inline-flex items-center gap-1 px-2 py-1 border border-gray-300 rounded-md">
                        {copied === r.clientId ? <Check size={12} /> : <Copy size={12} />} Copy
                      </button>
                      <a href={r.client.url} target="_blank" rel="noreferrer" className="px-2 py-1 border border-gray-300 rounded-md">Open</a>
                    </>
                  ) : (
                    <button disabled={!!busy || r.sections === 0} onClick={() => void release(r.clientId)} className="inline-flex items-center gap-1 px-2 py-1 border border-gray-300 rounded-md disabled:opacity-50">
                      <Unlock size={12} /> Open link
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-500">
        Writing style comes only from the company&apos;s own posts collected by social.gershon.ai before we took over; brand comes from its website.
        When either cannot be read, the reason shows under the company — upload what the client shared in its Knowledge Base instead.
      </p>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  const c = tone === "ok" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-gray-900";
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-semibold ${c}`}>{value}</div>
    </div>
  );
}
