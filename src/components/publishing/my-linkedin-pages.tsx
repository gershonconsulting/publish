"use client";

/**
 * Connections → "Your LinkedIn pages" (v0.7.0).
 *
 * Olivier signs in with LinkedIn once; every company page his account
 * administers is listed here with its name, and he links each page to a
 * CAMPAIGN or INTERNAL company. Validated content for that company is then
 * published on that page, from his account, by the Publish Chrome extension.
 */
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Link2, Loader2, RefreshCw, Sparkles, Unlink } from "lucide-react";

type Page = {
  urn: string; id: string; name: string; named: boolean; url: string; connectedBy: string | null;
  linkedTo: { id: string; name: string }[]; suggest: { id: string; name: string } | null;
};
type Account = { memberUrn: string; connectedBy: string | null; connectedAt: string; namesStatus: string | null; expiresAt: string };
type Co = { id: string; name: string; clientType: string };
type Data = { accounts: Account[]; pages: Page[]; companies: Co[]; connectUrl: string | null; canWrite: boolean };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function MyLinkedInPages({ onChanged }: { onChanged?: () => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/publishing/my-pages", { cache: "no-store" });
      const j = await r.json();
      if (j?.success) { setD(j.data); setErr(null); } else setErr(j?.error || "Could not load your LinkedIn pages.");
    } catch { setErr("Could not load your LinkedIn pages."); }
  }, []);
  useEffect(() => {
    void load();
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("linked_error")) setErr(sp.get("linked_error"));
      if (sp.get("linked") === "linkedin") setNote("LinkedIn connected — your pages are listed below.");
    } catch {}
  }, [load]);

  async function act(body: Record<string, unknown>, key: string) {
    setBusy(key); setErr(null);
    const r = await fetch("/api/publishing/my-pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    if (!j?.success) setErr(j?.error || "Failed.");
    else if (body.action === "refresh") {
      const st = (j.data?.refreshed || []).map((x: { pages: number; namesStatus: string | null }) => `${x.pages} pages${x.namesStatus ? ` — some names missing (${x.namesStatus}); the Publish extension fills them in` : ""}`).join(" · ");
      setNote(st ? `Page list refreshed: ${st}.` : "Nothing to refresh — connect LinkedIn first.");
    }
    await load();
    onChanged?.();
    setBusy(null);
  }

  const pages = d?.pages || [];
  const linked = pages.filter((p) => p.linkedTo.length);
  const suggested = pages.filter((p) => !p.linkedTo.length && p.suggest);
  const rest = pages.filter((p) => !p.linkedTo.length && !p.suggest);
  const shown = showAll ? rest : rest.slice(0, 8);
  const linkedIds = new Set(linked.flatMap((p) => p.linkedTo.map((c) => c.id)));

  function Row({ p }: { p: Page }) {
    const sel = pick[p.urn] ?? p.suggest?.id ?? "";
    return (
      <tr className="border-t border-gray-100 align-middle">
        <td className="py-2 pr-3">
          <a href={p.url} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 font-medium ${p.named ? "text-gray-900" : "text-gray-500 italic"} hover:underline`}>
            {p.name} <ExternalLink size={11} className="text-gray-400" />
          </a>
          {!p.named && <div className="text-[11px] text-gray-500">Name not given by LinkedIn yet — open it to see which page it is.</div>}
        </td>
        <td className="py-2 pr-3">
          {p.linkedTo.length ? (
            <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-medium"><CheckCircle2 size={13} /> {p.linkedTo.map((c) => c.name).join(", ")}</span>
          ) : (
            <select
              value={sel}
              disabled={!d?.canWrite || !!busy}
              onChange={(e) => setPick((m) => ({ ...m, [p.urn]: e.target.value }))}
              className="text-xs border border-gray-300 rounded px-1.5 py-1 max-w-[220px]"
            >
              <option value="">— choose a company —</option>
              {(d?.companies || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.clientType === "INTERNAL" ? " (Internal)" : " (Campaign)"}{linkedIds.has(c.id) ? " · has a page" : ""}</option>
              ))}
            </select>
          )}
          {!p.linkedTo.length && p.suggest && sel === p.suggest.id && (
            <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-amber-700"><Sparkles size={11} /> suggested</span>
          )}
        </td>
        <td className="py-2 text-right whitespace-nowrap">
          {d?.canWrite && (p.linkedTo.length ? (
            <button
              onClick={() => p.linkedTo.forEach((c) => void act({ action: "unlink", clientId: c.id }, p.urn))}
              disabled={!!busy}
              className="inline-flex items-center gap-1 text-xs text-red-700 underline disabled:opacity-40"
            ><Unlink size={11} /> Unlink</button>
          ) : (
            <button
              onClick={() => sel && void act({ action: "link", clientId: sel, urn: p.urn }, p.urn)}
              disabled={!sel || !!busy}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white rounded-md disabled:opacity-40"
              style={{ background: "#0A66C2" }}
            >{busy === p.urn ? <Loader2 size={11} className="animate-spin" /> : <Link2 size={11} />} Link</button>
          ))}
        </td>
      </tr>
    );
  }

  return (
    <section id="pages" className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <div>
          <div className="text-sm font-semibold text-gray-900">Your LinkedIn pages</div>
          <div className="text-xs text-gray-500 mt-0.5 max-w-2xl">
            Every company page your LinkedIn account is an admin of. Link a page to a company: content the client has validated for that company is published on that page, from your account, by the Publish Chrome extension.
          </div>
        </div>
        <div className="flex items-center gap-2">
          {d?.accounts.length ? (
            <button onClick={() => void act({ action: "refresh" }, "refresh")} disabled={!!busy || !d.canWrite} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">
              {busy === "refresh" ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Refresh page list
            </button>
          ) : null}
          {d?.connectUrl && d.canWrite && (
            <a href={d.connectUrl} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg" style={{ background: "#0A66C2" }}>
              <Link2 size={12} /> {d.accounts.length ? "Reconnect LinkedIn" : "Connect with LinkedIn"}
            </a>
          )}
        </div>
      </div>

      {err && <div className="text-sm rounded-lg px-3 py-2 my-2 bg-red-50 text-red-800">{err}</div>}
      {note && <div className="text-sm rounded-lg px-3 py-2 my-2 bg-emerald-50 text-emerald-800">{note}</div>}
      {!d && !err && <div className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</div>}

      {d && !d.accounts.length && <p className="text-sm text-gray-600 mt-2">Not connected yet — press “Connect with LinkedIn” and sign in with the account that administers the pages.</p>}

      {d && d.accounts.length > 0 && (
        <>
          <div className="text-xs text-gray-500 mb-2">
            {d.accounts.map((a) => `Connected as ${a.connectedBy || "LinkedIn member"} on ${day(a.connectedAt)} · renew by ${day(a.expiresAt)}`).join(" · ")}
            {" · "}{pages.length} pages · {linked.length} linked
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-gray-400">
              <tr><th className="py-1 pr-3 font-medium">LinkedIn page</th><th className="py-1 pr-3 font-medium">Company in Publish</th><th className="py-1" /></tr>
            </thead>
            <tbody>
              {linked.map((p) => <Row key={p.urn} p={p} />)}
              {suggested.map((p) => <Row key={p.urn} p={p} />)}
              {shown.map((p) => <Row key={p.urn} p={p} />)}
            </tbody>
          </table>
          {rest.length > shown.length && (
            <button onClick={() => setShowAll(true)} className="mt-2 text-xs text-gray-600 underline">Show all {rest.length} other pages</button>
          )}
        </>
      )}
    </section>
  );
}
