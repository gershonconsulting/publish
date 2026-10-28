"use client";

/**
 * Connections → "Your X accounts" (v0.8.0) — the X twin of "Your LinkedIn
 * pages", CloudCampaign-style (Olivier 2026-10-26: "On Twitter, I should all
 * being already connected to the Twitter account").
 *
 * Nothing to sign in to here: every X account already signed in to a
 * publishing Chrome (its account switcher, reported by the extension) is
 * listed, and each one is linked to a Campaign/Internal company in one click.
 * Companies whose X handle no Chrome is signed in to are listed below with the
 * exact fix.
 */
import { useMemo, useState } from "react";
import { CheckCircle2, Link2, Loader2, Unlink } from "lucide-react";

export type XBrowser = { id: string; label: string; online: boolean; xSignedIn: boolean; x: string[] };
export type XRow = { id: string; name: string; clientType: string; xHandle: string | null };

const norm = (h: string | null | undefined) => (h || "").replace(/^@/, "").trim().toLowerCase();

export function MyXAccounts({
  browsers, rows, canWrite, onChanged,
}: { browsers: XBrowser[]; rows: XRow[] | null; canWrite: boolean; onChanged: () => void }) {
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Every X account signed in to any Chrome, with the Chromes that hold it.
  const accounts = useMemo(() => {
    const m = new Map<string, { handle: string; chromes: { label: string; online: boolean }[] }>();
    for (const b of browsers) {
      if (!b.xSignedIn) continue;
      for (const h of b.x || []) {
        const k = norm(h);
        if (!k) continue;
        if (!m.has(k)) m.set(k, { handle: h.replace(/^@/, ""), chromes: [] });
        m.get(k)!.chromes.push({ label: b.label, online: b.online });
      }
    }
    return Array.from(m.values()).sort((a, b) => a.handle.localeCompare(b.handle));
  }, [browsers]);

  const signedIn = new Set(accounts.map((a) => norm(a.handle)));
  const missing = (rows || []).filter((r) => r.xHandle && !signedIn.has(norm(r.xHandle)));
  const unlinked = (rows || []).filter((r) => !r.xHandle);

  async function link(clientId: string, xHandle: string, key: string) {
    setBusy(key); setErr(null); setNote(null);
    try {
      const r = await fetch("/api/publishing/accounts", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, xHandle }),
      });
      const j = await r.json().catch(() => null);
      if (!j?.success) setErr(j?.error || "Could not save.");
      else {
        const co = rows?.find((x) => x.id === clientId)?.name || "the company";
        setNote(xHandle ? `${co} now posts on X as @${xHandle.replace(/^@/, "")}.` : `${co} no longer posts on X.`);
        onChanged();
      }
    } catch { setErr("Could not save."); }
    setBusy(null);
  }

  return (
    <section id="x-accounts" className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="text-sm font-semibold text-gray-900">Your X accounts</div>
        <div className="text-xs text-gray-500">{accounts.length} signed in to your publishing Chromes</div>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Every X account signed in to a Chrome with the Publish extension shows up here on its own. Link each one to a company and its validated posts go out from that account.
      </p>
      {err && <div className="text-sm rounded-lg px-3 py-2 mb-3 bg-red-50 text-red-800">{err}</div>}
      {note && <div className="text-sm rounded-lg px-3 py-2 mb-3 bg-emerald-50 text-emerald-800">{note}</div>}

      {accounts.length === 0 ? (
        <p className="text-sm text-gray-600">No X account is signed in to a publishing Chrome yet. Open x.com in that Chrome and sign in. Add every company account with X&apos;s &ldquo;Add an existing account&rdquo; and it appears here within 5 minutes.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {accounts.map((a) => {
            const k = norm(a.handle);
            const linked = (rows || []).filter((r) => norm(r.xHandle) === k);
            const choices = (rows || []).filter((r) => norm(r.xHandle) !== k);
            return (
              <div key={k} className="py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
                <div className="min-w-[200px]">
                  <a href={`https://x.com/${a.handle}`} target="_blank" rel="noreferrer" className="font-medium text-gray-900 hover:underline">@{a.handle}</a>
                  <div className="text-[11px] text-gray-500">
                    {a.chromes.map((c) => `${c.label}${c.online ? "" : " (offline)"}`).join(" · ")}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 flex-1">
                  {linked.length === 0 && <span className="text-xs text-gray-400">Not linked to a company</span>}
                  {linked.map((r) => (
                    <span key={r.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-xs font-medium">
                      <CheckCircle2 size={11} /> {r.name}
                      {canWrite && (
                        <button title="Unlink" disabled={!!busy} onClick={() => void link(r.id, "", `u:${r.id}`)} className="ml-0.5 text-emerald-700 hover:text-red-700">
                          <Unlink size={11} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                {canWrite && choices.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <select value={pick[k] || ""} onChange={(e) => setPick((p) => ({ ...p, [k]: e.target.value }))} className="text-xs border border-gray-300 rounded-lg px-2 py-1 max-w-[200px]">
                      <option value="">Link to a company…</option>
                      {choices.map((r) => <option key={r.id} value={r.id}>{r.name}{r.xHandle ? ` (now @${r.xHandle})` : ""}</option>)}
                    </select>
                    <button disabled={!pick[k] || !!busy} onClick={() => void link(pick[k], a.handle, `l:${k}`)} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-gray-900 rounded-lg disabled:opacity-40">
                      {busy === `l:${k}` ? <Loader2 size={11} className="animate-spin" /> : <Link2 size={11} />} Link
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {missing.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="text-xs font-semibold text-red-700 mb-1">Linked, but no Chrome is signed in to the account</div>
          <ul className="text-sm text-gray-700 space-y-0.5">
            {missing.map((r) => (
              <li key={r.id}><span className="font-medium">{r.name}</span> → @{r.xHandle}: sign in to x.com as @{r.xHandle} in the publishing Chrome. Use &ldquo;Add an existing account&rdquo; to keep your other accounts signed in.</li>
            ))}
          </ul>
        </div>
      )}
      {rows && unlinked.length > 0 && (
        <div className="mt-2 text-xs text-gray-500">No X account yet: {unlinked.map((r) => r.name).join(", ")}.</div>
      )}
    </section>
  );
}
