"use client";

/**
 * Connections → "Client X connect links" (v0.8.1). One private link per
 * company: the client signs in to their own X account on x.com and clicks
 * Allow — no client password is ever shared with Gershon.
 */
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, Loader2, RefreshCw, XCircle } from "lucide-react";

type Row = { id: string; name: string; clientType: string; url: string; xHandle: string | null; connected: string | null; lastError: string | null };

export function XConnectLinks({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const j = await fetch("/api/publishing/x-links", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (j?.success) { setRows(j.data); setErr(null); } else setErr(j?.error || "Could not load the links.");
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function copy(r: Row) {
    try { await navigator.clipboard.writeText(r.url); setCopied(r.id); setTimeout(() => setCopied(null), 2000); } catch { window.prompt("Copy this link:", r.url); }
  }
  async function renew(r: Row) {
    if (!confirm(`Make a new link for ${r.name}? The old link stops working.`)) return;
    setBusy(r.id);
    await fetch("/api/publishing/x-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: r.id }) }).catch(() => null);
    setBusy(null);
    void load();
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 mb-5" id="x-links">
      <h2 className="font-semibold text-gray-900">Client X connect links</h2>
      <p className="text-xs text-gray-500 mt-1 mb-3">
        Send each client their link. They sign in to their own X account on x.com and click Allow — no password is shared with us.
        Posts then go out through the X API with no link in them ($0.015 each).
      </p>
      {err && <p className="text-sm text-red-700">{err}</p>}
      {!rows && !err && <Loader2 className="animate-spin text-gray-400" size={16} />}
      {rows && (
        <ul className="divide-y divide-gray-100">
          {rows.map((r) => {
            const ok = !!r.connected && !r.lastError;
            return (
              <li key={r.id} className="py-2 flex items-center gap-3 text-sm">
                {ok ? <CheckCircle2 size={16} className="text-green-600 shrink-0" /> : <XCircle size={16} className="text-red-500 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-900 truncate">{r.name} <span className="text-xs text-gray-400">{r.clientType}</span></div>
                  <div className="text-xs text-gray-500 truncate">
                    {ok ? `Connected as @${r.connected}` : r.lastError ? `Needs reconnecting: ${r.lastError}` : `Not connected${r.xHandle ? ` — expects @${r.xHandle}` : ""}`}
                  </div>
                </div>
                <button onClick={() => void copy(r)} className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs hover:bg-gray-50">
                  <Copy size={12} /> {copied === r.id ? "Copied" : "Copy link"}
                </button>
                {canWrite && (
                  <button onClick={() => void renew(r)} title="New link (the old one stops working)" className="rounded-md border border-gray-200 p-1 text-gray-500 hover:bg-gray-50" disabled={busy === r.id}>
                    {busy === r.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
