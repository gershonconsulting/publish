"use client";

/**
 * Knowledge validation page (v0.16.0). One page, two audiences:
 *   - internal (ki_ link): the Gershon team member running the campaign checks
 *     each section, can correct the text right here, and marks it Correct;
 *   - client (kc_ link): opens once every section passed the internal check;
 *     the client confirms each section or says what to change.
 */

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, MessageSquare, PencilLine } from "lucide-react";

type Verdict = { status: "ok" | "changes"; comment: string; name: string | null; at: string; fp: string };
type Section = {
  id: string; kind: "valueProp" | "competitive" | "icp" | "style"; title: string; text: string;
  source: "ai" | "manual"; updatedAt: string | null; status: "pending" | "ok" | "changes"; verdict: Verdict | null;
};
type Summary = { total: number; ok: number; changes: number; pending: number; complete: boolean };
type Data = { level: "internal" | "client"; client: string; logoUrl: string | null; agency: string; open: boolean; sections: Section[]; summary: Summary };

const NAME_KEY = "review_name";
const HINT: Record<Section["kind"], string> = {
  valueProp: "What you sell, to whom, and why you win. Every post we write carries it.",
  competitive: "Who you compete with and how we position you against them.",
  icp: "One of the customer profiles we write for. Each post speaks to one of them.",
  style: "How you write. We keep this voice in your posts.",
};

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
}

export function KbReviewClient({ token }: { token: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/kb-review/${token}`, { cache: "no-store" });
      const j = await r.json();
      if (j?.success) { setData(j.data); setErr(null); }
      else setErr(j?.error || "This review link is not valid.");
    } catch { setErr("Could not load."); }
  }, [token]);

  useEffect(() => {
    void load();
    try { setName(localStorage.getItem(NAME_KEY) || ""); } catch {}
  }, [load]);

  function rememberName(v: string) {
    setName(v);
    try { localStorage.setItem(NAME_KEY, v); } catch {}
  }

  if (err && !data) return <Center><p className="text-gray-700">{err}</p></Center>;
  if (!data) return <Center><Loader2 className="animate-spin text-gray-400" /></Center>;
  const internal = data.level === "internal";

  if (!data.open) {
    return (
      <Center>
        <div className="max-w-md">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Almost ready</h1>
          <p className="text-gray-700">We are finishing an internal check of what we know about {data.client}. This page opens as soon as it is done. Thank you for your patience.</p>
        </div>
      </Center>
    );
  }

  const s = data.summary;
  return (
    <div className="min-h-screen bg-[#f5f6f8]">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-5 flex flex-wrap items-center gap-3">
          {data.logoUrl && <img src={data.logoUrl} alt="" className="w-10 h-10 rounded-md object-contain bg-white border border-gray-100" />}
          <div className="flex-1 min-w-[200px]">
            <div className="text-xs text-gray-500">{data.agency} · {internal ? "internal knowledge check" : "knowledge review"}</div>
            <h1 className="text-2xl font-bold text-gray-900">What we know about {data.client}</h1>
          </div>
          <label className="text-xs text-gray-600">
            Your name
            <input value={name} onChange={(e) => rememberName(e.target.value)} placeholder="So we know who replied" className="block mt-1 text-sm border border-gray-300 rounded-md px-2 py-1 w-48" />
          </label>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {err && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Couldn&apos;t refresh just now: {err}. What you see may be slightly out of date.
          </div>
        )}
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-sm text-gray-700">
            {internal
              ? <>Check every section before it goes to {data.client}. Correct the text if needed, then mark it <b>Correct</b>. The client&apos;s review opens once all sections are correct.</>
              : <>We write your posts from this knowledge. Please confirm each section, or tell us what is wrong or missing. It takes a few minutes and makes every post more on target.</>}
          </p>
          <div>
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>{s.ok} of {s.total} section{s.total === 1 ? "" : "s"} validated{s.changes ? ` · ${s.changes} with changes asked` : ""}</span>
              {s.complete && <span className="text-emerald-700 font-semibold">All validated, thank you</span>}
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: `${s.total ? (100 * s.ok) / s.total : 0}%` }} />
            </div>
          </div>
        </div>

        {data.sections.map((sec) => (
          <SectionCard key={sec.id} sec={sec} token={token} name={name} internal={internal} onDone={load} />
        ))}
        <p className="text-[11px] text-gray-400 text-center">
          This private link is for {internal ? `the ${data.agency || "Gershon"} team` : data.client} only.
        </p>
      </main>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center bg-[#f5f6f8] px-4 text-center">{children}</div>;
}

function Badge({ status }: { status: Section["status"] }) {
  if (status === "ok") return <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Correct</span>;
  if (status === "changes") return <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">Changes asked</span>;
  return <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 border border-gray-200">To check</span>;
}

function SectionCard({ sec, token, name, internal, onDone }: { sec: Section; token: string; name: string; internal: boolean; onDone: () => void }) {
  const [mode, setMode] = useState<"none" | "changes" | "edit">("none");
  const [comment, setComment] = useState("");
  const [text, setText] = useState(sec.text);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { setText(sec.text); }, [sec.text]);

  async function send(status: "ok" | "changes", withText = false) {
    if (status === "changes" && !comment.trim()) { setMsg("Tell us what to change."); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/kb-review/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: sec.id, status, comment: status === "changes" ? comment : "", name, ...(withText ? { text } : {}) }),
      });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.error || "Could not send.");
      setMode("none"); setComment("");
      setMsg(status === "ok" ? (withText ? "Saved and marked correct." : "Marked correct, thank you.") : "Sent, we will update it.");
      onDone();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not send."); }
    setBusy(false);
  }

  const v = sec.verdict;
  const stale = v && sec.status === "pending";
  return (
    <article className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-gray-900">{sec.title}</h2>
        <span className="ml-auto"><Badge status={sec.status} /></span>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-xs text-gray-500">
          {HINT[sec.kind]} {sec.source === "ai" ? (internal ? "AI draft, not edited by the team yet" : "Drafted by our AI from your public posts") : "Written by our team"}{sec.updatedAt ? `, ${fmt(sec.updatedAt)}` : ""}.
        </p>
        {mode === "edit" ? (
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} className="w-full border border-gray-300 rounded-lg p-3 text-sm leading-relaxed" />
        ) : sec.text.trim() ? (
          <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{sec.text}</div>
        ) : (
          <p className="text-sm text-amber-700">Nothing recorded here yet. Tell us what it should say.</p>
        )}

        {v && (
          <div className={`text-xs rounded-lg px-3 py-2 ${stale ? "bg-gray-50 text-gray-500" : v.status === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
            {stale && <>Updated since your last answer. Please check it again. </>}
            {v.status === "ok" ? "Marked correct" : "Changes asked"}{v.name ? ` by ${v.name}` : ""}{v.at ? `, ${fmt(v.at)}` : ""}
            {v.comment && <div className="mt-1 whitespace-pre-wrap text-gray-700">“{v.comment}”</div>}
          </div>
        )}

        {mode === "changes" && (
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} placeholder="What is wrong or missing?" className="w-full border border-gray-300 rounded-lg p-2 text-sm" />
        )}

        <div className="flex flex-wrap items-center gap-2">
          {mode === "edit" ? (
            <>
              <button disabled={busy || !text.trim()} onClick={() => send("ok", true)} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-emerald-600 rounded-lg disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={16} />} Save and mark correct
              </button>
              <button disabled={busy} onClick={() => { setMode("none"); setText(sec.text); }} className="px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg">Cancel</button>
            </>
          ) : mode === "changes" ? (
            <>
              <button disabled={busy} onClick={() => send("changes")} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-amber-600 rounded-lg disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={16} />} Send
              </button>
              <button disabled={busy} onClick={() => setMode("none")} className="px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg">Cancel</button>
            </>
          ) : (
            <>
              <button disabled={busy || sec.status === "ok"} onClick={() => send("ok")} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-emerald-600 rounded-lg disabled:opacity-40">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={16} />} Correct
              </button>
              <button disabled={busy} onClick={() => setMode("changes")} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-amber-800 border border-amber-300 bg-amber-50 rounded-lg">
                <MessageSquare size={14} /> Needs changes
              </button>
              {internal && (
                <button disabled={busy} onClick={() => setMode("edit")} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg">
                  <PencilLine size={14} /> Edit the text
                </button>
              )}
            </>
          )}
          {msg && <span className="text-xs text-gray-600">{msg}</span>}
        </div>
      </div>
    </article>
  );
}
