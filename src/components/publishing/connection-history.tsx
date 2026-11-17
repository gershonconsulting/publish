"use client";

/**
 * v0.20.0 — Connections → "Connection history" (Olivier 2026-11-17: "I don't know
 * when these pages were disconnected. We need a log in connections per client").
 *  - Picked company: every dated event (connected, expired, stopped working,
 *    disconnected…) plus the last post that went out through each connection.
 *  - All companies: one line per company with the latest LinkedIn and X event.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, Clock, History, Loader2, XCircle, AlertTriangle } from "lucide-react";

type Ev = { at: string; net: "linkedin" | "x"; kind: string; as: string | null; detail?: string | null; by?: string | null; inferred?: boolean; text: string };
type Now = { status: "connected" | "error" | "expired" | "none"; as: string | null; error: string | null; expiry: string | null };
type Proof = { lastApiPost: { at: string; url: string | null } | null; lastFailure: { at: string; error: string | null } | null };
type One = { id: string; name: string; now: Record<"linkedin" | "x", Now>; last: Record<"linkedin" | "x", Ev | null>; events: Ev[]; evidence: Record<"linkedin" | "x", Proof> };
type Row = { id: string; name: string; clientType: string; now: Record<"linkedin" | "x", Now>; last: Record<"linkedin" | "x", Ev | null> };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });

function Icon({ kind }: { kind: string }) {
  if (kind === "connected" || kind === "reconnected" || kind === "recovered" || kind === "renewed") return <CheckCircle2 size={15} className="text-green-600 shrink-0" />;
  if (kind === "expired") return <Clock size={15} className="text-amber-600 shrink-0" />;
  if (kind === "error") return <AlertTriangle size={15} className="text-red-600 shrink-0" />;
  if (kind === "seen") return <History size={15} className="text-gray-400 shrink-0" />;
  return <XCircle size={15} className="text-red-500 shrink-0" />;
}

function StateLine({ label, s, last }: { label: string; s: Now; last: Ev | null }) {
  const since = last && last.kind !== "seen" ? `since ${day(last.at)}` : "";
  const txt =
    s.status === "connected" ? `Connected${s.as ? ` as ${s.as}` : ""}${since ? ` · ${since}` : ""}${s.expiry ? ` · until ${day(s.expiry)}` : ""}`
      : s.status === "expired" ? `Expired on ${day(s.expiry || last?.at || new Date().toISOString())}`
      : s.status === "error" ? `Stopped working${last?.kind === "error" ? ` on ${day(last.at)}` : ""}: ${s.error || ""}`
      : last && last.kind === "disconnected" ? `Disconnected on ${day(last.at)}`
      : last && last.kind === "seen" ? `Not connected (no connection recorded since ${day(last.at)})`
      : "Not connected";
  return (
    <div className="flex items-start gap-2 text-sm">
      {s.status === "connected" ? <CheckCircle2 size={15} className="text-green-600 mt-0.5 shrink-0" /> : <XCircle size={15} className="text-red-500 mt-0.5 shrink-0" />}
      <div><span className="font-medium text-gray-900">{label}:</span> <span className="text-gray-700">{txt}</span></div>
    </div>
  );
}

export function ConnectionHistory({ clientId }: { clientId?: string }) {
  const [one, setOne] = useState<One | null>(null);
  const [all, setAll] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setOne(null); setAll(null); setErr(null);
    fetch(`/api/publishing/conn-log${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!j?.success) setErr(j?.error || "Could not load the history."); else if (clientId) setOne(j.data); else setAll(j.data); })
      .catch(() => setErr("Could not load the history."));
  }, [clientId]);

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 mb-5" id="connection-history">
      <h2 className="font-semibold text-gray-900 flex items-center gap-2"><History size={16} /> Connection history</h2>
      <p className="text-xs text-gray-500 mt-1 mb-3">
        Every connect, disconnect, expiry and failure of the direct LinkedIn and X connections, with the date (New York time).
        Recording started on Nov 17, 2026 — earlier dates come from the connection itself or from the posts that went out through it.
      </p>
      {err && <p className="text-sm text-red-700">{err}</p>}
      {!err && !one && !all && <Loader2 className="animate-spin text-gray-400" size={16} />}

      {one && (
        <div className="space-y-4">
          <div className="space-y-1">
            <StateLine label="LinkedIn" s={one.now.linkedin} last={one.last.linkedin} />
            <StateLine label="X" s={one.now.x} last={one.last.x} />
          </div>
          <div className="grid sm:grid-cols-2 gap-2 text-xs text-gray-600">
            {(["linkedin", "x"] as const).map((n) => (
              <div key={n} className="rounded-lg bg-gray-50 px-3 py-2">
                <div className="font-medium text-gray-800 mb-0.5">{n === "x" ? "X" : "LinkedIn"} — last proof it worked</div>
                {one.evidence[n].lastApiPost
                  ? <div>Last post through the connection: {fmt(one.evidence[n].lastApiPost!.at)}{one.evidence[n].lastApiPost!.url && <> · <a className="underline" href={one.evidence[n].lastApiPost!.url!} target="_blank" rel="noreferrer">open</a></>}</div>
                  : <div>No post has ever gone out through this connection.</div>}
                {one.evidence[n].lastFailure && <div className="text-red-700">Last failed post: {fmt(one.evidence[n].lastFailure!.at)}{one.evidence[n].lastFailure!.error ? ` — ${one.evidence[n].lastFailure!.error}` : ""}</div>}
              </div>
            ))}
          </div>
          <ul className="divide-y divide-gray-100">
            {one.events.map((e, i) => (
              <li key={i} className="py-2 flex items-start gap-3 text-sm">
                <Icon kind={e.kind} />
                <div className="min-w-0 flex-1">
                  <div className="text-gray-900">{e.text}</div>
                  <div className="text-xs text-gray-500">
                    {fmt(e.at)}{e.by ? ` · by ${e.by}` : ""}{e.detail ? ` · ${e.detail}` : ""}{e.inferred ? " · reconstructed" : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {all && (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-gray-500"><th className="py-1 pr-2">Company</th><th className="py-1 pr-2">LinkedIn</th><th className="py-1">X</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {all.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="py-2 pr-2 font-medium text-gray-900">{r.name} <span className="text-xs text-gray-400">{r.clientType}</span></td>
                {(["linkedin", "x"] as const).map((n) => (
                  <td key={n} className="py-2 pr-2">
                    {r.last[n] ? (
                      <div className="flex items-start gap-1.5"><Icon kind={r.now[n].status === "connected" ? "connected" : r.last[n]!.kind} />
                        <div><div className="text-gray-800">{r.last[n]!.text}</div><div className="text-xs text-gray-500">{fmt(r.last[n]!.at)}</div></div>
                      </div>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
