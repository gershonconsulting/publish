"use client";

/**
 * /intelligence — v0.9.0. The cross-app Intelligence menu (Olivier,
 * 2026-10-05), on Cloudflare Workers AI, in four tabs:
 *   Analysis     what the dashboard says, in plain words
 *   Suggestions  what to do next, each with its button
 *   Chat         ask about the data and the suggestions
 *   Create       AI writes drafts for a company's empty posting days
 *                (drafts only — reviewed and approved as usual)
 * Follows the client picked in the left menu.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Lightbulb, Loader2, MessageSquare, RefreshCw, Send, Sparkles, Wand2 } from "lucide-react";
import { Header } from "@/components/layout/header";
import { useSelectedClient } from "@/lib/selected-client";
import { Card, ago, withClient } from "@/components/publish/ui";
import type { Analysis } from "@/lib/intelligence";

type Tab = "analysis" | "suggestions" | "chat" | "create";
const TABS: { key: Tab; label: string; icon: typeof Sparkles }[] = [
  { key: "analysis", label: "Analysis", icon: Sparkles },
  { key: "suggestions", label: "Suggestions", icon: Lightbulb },
  { key: "chat", label: "Chat", icon: MessageSquare },
  { key: "create", label: "Create content", icon: Wand2 },
];

export function IntelligenceClient() {
  const { clientId, clients } = useSelectedClient();
  const [tab, setTab] = useState<Tab>("analysis");
  const [a, setA] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
      if (t && TABS.some((x) => x.key === t)) setTab(t);
    } catch {}
  }, []);
  const pick = (t: Tab) => {
    setTab(t);
    try { const u = new URL(window.location.href); u.searchParams.set("tab", t); window.history.replaceState(window.history.state, "", u.toString()); } catch {}
  };

  const run = useCallback(async (refresh: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/intelligence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ window: "month", client: clientId || null, refresh }) });
      const j = await r.json();
      if (j?.success) setA(j.data); else setErr(j?.error || "Intelligence is unavailable.");
    } catch { setErr("Intelligence is unavailable."); } finally { setBusy(false); }
  }, [clientId]);
  useEffect(() => { setA(null); void run(false); }, [run]);

  const company = clientId ? clients?.find((c) => c.id === clientId)?.name : null;

  return (
    <div>
      <Header
        title={company ? `Intelligence — ${company}` : "Intelligence"}
        eyebrow="Publish"
        subtitle="Cloudflare Workers AI reads the dashboard (last 30 days) and tells you what it means, what to do, answers your questions and writes the posts that are missing. It never approves or publishes anything."
        actions={
          <button onClick={() => void run(true)} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#CC3333] rounded-lg hover:bg-[#A8281F] disabled:opacity-60">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Analyse again
          </button>
        }
      />
      <div className="flex flex-wrap gap-1 mb-5 border-b border-gray-200">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => pick(t.key)} className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium -mb-px border-b-2 ${tab === t.key ? "border-[#CC3333] text-[#A8281F]" : "border-transparent text-gray-600 hover:text-gray-900"}`}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>
      {err && <div className="text-sm rounded-lg px-3 py-2 mb-4 bg-red-50 text-red-800">{err}</div>}
      {tab === "analysis" && <AnalysisTab a={a} busy={busy} />}
      {tab === "suggestions" && <SuggestionsTab a={a} busy={busy} />}
      {tab === "chat" && <ChatTab clientId={clientId} />}
      {tab === "create" && <CreateTab clientId={clientId} clients={clients} ideas={a?.ideas || []} />}
    </div>
  );
}

function Stamp({ a }: { a: Analysis }) {
  return (
    <p className="text-[11px] text-gray-400 mt-4">
      {a.source === "ai" ? <>AI analysis · {a.model} · generated {ago(a.generatedAt)}{a.stale ? " · the data changed since — press Analyse again" : ""}</> : <>Rule-based (the AI did not answer{a.error ? `: ${a.error}` : ""}) — these are the dashboard&apos;s own rules, not an AI analysis.</>}
      {" "}· The numbers come from the dashboard; the AI only explains them.
    </p>
  );
}

function Wait({ busy }: { busy: boolean }) {
  return <div className="text-sm text-gray-500 flex items-center gap-2">{busy ? <><Loader2 size={14} className="animate-spin" /> The AI is reading the dashboard (10–30 seconds)…</> : "No analysis yet."}</div>;
}

const INSIGHT_TONE = { ok: "border-emerald-200 bg-emerald-50", warn: "border-amber-200 bg-amber-50", bad: "border-red-200 bg-red-50", info: "border-gray-200 bg-white" } as const;

function AnalysisTab({ a, busy }: { a: Analysis | null; busy: boolean }) {
  if (!a) return <Wait busy={busy} />;
  return (
    <div className="space-y-5">
      <Card title={a.headline} subtitle="Briefing">
        <p className="text-[15px] text-gray-800 leading-relaxed">{a.summary}</p>
      </Card>
      {a.insights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {a.insights.map((i, k) => (
            <div key={k} className={`rounded-xl border p-4 ${INSIGHT_TONE[i.tone]}`}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{i.company || "All companies"}</div>
              <div className="text-sm font-semibold text-gray-900 mt-0.5">{i.title}</div>
              <p className="text-sm text-gray-700 mt-1">{i.detail}</p>
            </div>
          ))}
        </div>
      )}
      <Stamp a={a} />
    </div>
  );
}

function SuggestionsTab({ a, busy }: { a: Analysis | null; busy: boolean }) {
  if (!a) return <Wait busy={busy} />;
  if (!a.suggestions.length) return <div className="rounded-lg bg-emerald-50 text-emerald-800 text-sm px-3 py-2.5">No suggestion — everything is on track.</div>;
  return (
    <div>
      <ol className="space-y-3">
        {a.suggestions.map((s, i) => (
          <li key={i} className="bg-white rounded-xl border border-gray-200 p-4 flex gap-3">
            <span className={`w-7 h-7 rounded-full text-sm font-bold flex items-center justify-center flex-shrink-0 ${s.priority === "high" ? "bg-[#CC3333] text-white" : s.priority === "medium" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600"}`}>{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-900">{s.title}</div>
              {s.why && <p className="text-sm text-gray-600 mt-0.5"><b className="font-medium text-gray-700">Why:</b> {s.why}</p>}
              {s.action && <p className="text-sm text-gray-600 mt-0.5"><b className="font-medium text-gray-700">Do:</b> {s.action}</p>}
              <div className="text-[11px] text-gray-400 mt-1">{s.company || "All companies"} · priority {s.priority}</div>
            </div>
            <Link href={s.href} className="self-center text-sm font-semibold rounded-lg bg-[#CC3333] hover:bg-[#A8281F] text-white px-3 py-1.5 whitespace-nowrap">{s.kind === "fill_gap" || s.kind === "content_idea" ? "Write with AI" : "Open"}</Link>
          </li>
        ))}
      </ol>
      <Stamp a={a} />
    </div>
  );
}

type Msg = { role: "user" | "assistant"; content: string };
const STARTERS = ["Which company needs content first, and how many posts?", "Why did posts fail this week?", "Who is slowing down approvals?", "Give me 5 post ideas for the company with the least content."];

function ChatTab({ clientId }: { clientId: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs, busy]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    const next = [...msgs, { role: "user" as const, content: question }];
    setMsgs(next);
    setText("");
    setBusy(true);
    try {
      const r = await fetch("/api/intelligence/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ window: "month", client: clientId || null, messages: next }) });
      const j = await r.json();
      setMsgs([...next, { role: "assistant", content: j?.success ? j.data.answer : `⚠️ ${j?.error || "The AI did not answer."}` }]);
    } catch {
      setMsgs([...next, { role: "assistant", content: "⚠️ The AI did not answer." }]);
    } finally { setBusy(false); }
  };

  return (
    <Card title="Ask about your content" subtitle="Answers use this workspace's Publish data only (last 30 days). It can draft ideas and posts; it cannot change, approve or publish anything.">
      <div className="min-h-[260px] max-h-[520px] overflow-y-auto space-y-3 pr-1">
        {msgs.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {STARTERS.map((s) => <button key={s} onClick={() => void ask(s)} className="text-xs rounded-full border border-gray-300 bg-white px-3 py-1.5 text-gray-700 hover:border-[#CC3333] hover:text-[#A8281F]">{s}</button>)}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-[#CC3333] text-white" : "bg-gray-100 text-gray-900"}`}>{m.content}</div>
          </div>
        ))}
        {busy && <div className="text-xs text-gray-500 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Thinking…</div>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void ask(text); }} className="mt-3 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask a question about the dashboard…" className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#CC3333]/30 focus:border-[#CC3333]" />
        <button type="submit" disabled={busy || !text.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#CC3333] hover:bg-[#A8281F] disabled:opacity-50 text-white px-3.5 py-2 text-sm font-semibold"><Send size={14} /> Ask</button>
      </form>
    </Card>
  );
}

type Gaps = { company: string; gaps: string[]; perWeek: number | null };
type Written = { id: string; day: string; title: string };

function CreateTab({ clientId, clients, ideas }: { clientId: string; clients: { id: string; name: string }[] | null; ideas: Analysis["ideas"] }) {
  const [pickId, setPickId] = useState(clientId);
  const [g, setG] = useState<Gaps | null>(null);
  const [n, setN] = useState(5);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Written[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const stop = useRef(false);
  useEffect(() => { setPickId(clientId); }, [clientId]);

  const loadGaps = useCallback(async () => {
    if (!pickId) { setG(null); return; }
    try {
      const r = await fetch(`/api/intelligence/fill-gap?clientId=${encodeURIComponent(pickId)}`, { cache: "no-store" });
      const j = await r.json();
      setG(j?.success ? j.data : null);
    } catch { setG(null); }
  }, [pickId]);
  useEffect(() => { setDone([]); setMsg(null); void loadGaps(); }, [loadGaps]);

  const write = async () => {
    if (!g || !pickId) return;
    setBusy(true);
    setMsg(null);
    stop.current = false;
    const days = g.gaps.slice(0, n);
    let written: Written[] = [];
    try {
      for (let round = 0; round < 12 && !stop.current; round++) {
        const r = await fetch("/api/intelligence/fill-gap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientId: pickId, days }) });
        const j = await r.json();
        if (!j?.success) { setMsg(j?.error || "The AI did not answer."); break; }
        written = [...written, ...j.data.items];
        setDone(written);
        if (j.data.errors?.length && !j.data.written) { setMsg(j.data.errors[0]); break; }
        if (!j.data.remaining) break;
      }
      if (written.length) setMsg(`${written.length} draft${written.length === 1 ? "" : "s"} written. Review them in Content & review, then send them for approval.`);
    } finally {
      setBusy(false);
      void loadGaps();
    }
  };

  const fmt = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const myIdeas = ideas.filter((i) => i.clientId === pickId);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      <Card className="xl:col-span-2" title="Fill the empty posting days with AI" subtitle="Cloudflare AI writes each missing day's LinkedIn post, its X version and a picture — from the company's Knowledge Base, its ICPs, what competitors post and its best past posts. They arrive as DRAFTS on their day: nothing goes out before someone reviews and approves it.">
        <div className="flex flex-wrap items-center gap-3">
          <select value={pickId} onChange={(e) => setPickId(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm min-w-[220px]">
            <option value="">Choose a company…</option>
            {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {g && (
            <span className="text-sm text-gray-600">
              <b className="text-gray-900">{g.gaps.length}</b> empty posting day{g.gaps.length === 1 ? "" : "s"} to the end of next month{g.perWeek ? ` (${g.perWeek} posts a week)` : ""}
            </span>
          )}
        </div>
        {!pickId ? (
          <p className="text-sm text-gray-500 mt-4">Pick a company to see its empty days.</p>
        ) : !g ? (
          <p className="text-sm text-gray-500 mt-4 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</p>
        ) : g.gaps.length === 0 ? (
          <div className="rounded-lg bg-emerald-50 text-emerald-800 text-sm px-3 py-2.5 mt-4 flex items-center gap-2"><CheckCircle2 size={16} /> Every posting day of {g.company} has an approved or scheduled post. Nothing to fill.</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 mt-4">
              {g.gaps.slice(0, 40).map((d, i) => (
                <span key={d} className={`text-xs rounded-md px-2 py-1 border ${i < n ? "border-[#CC3333] bg-[#FDF2F2] text-[#A8281F] font-medium" : "border-gray-200 bg-white text-gray-500"}`}>{fmt(d)}</span>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">Days that already have a draft are skipped. Highlighted = the days that will be written.</p>
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <label className="text-sm text-gray-700">Write the first</label>
              <select value={n} onChange={(e) => setN(Number(e.target.value))} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                {[1, 3, 5, 7, 10, 15, 20].filter((x) => x <= Math.max(1, g.gaps.length)).map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <span className="text-sm text-gray-700">days</span>
              <button onClick={() => void write()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-[#CC3333] hover:bg-[#A8281F] disabled:opacity-60 text-white px-4 py-2 text-sm font-semibold">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />} {busy ? `Writing… ${done.length}/${Math.min(n, g.gaps.length)}` : "Write drafts with AI"}
              </button>
              {busy && <button onClick={() => { stop.current = true; }} className="text-xs text-gray-600 hover:underline">Stop after this one</button>}
            </div>
            <p className="text-[11px] text-gray-400 mt-2">About 20–40 seconds per post (text + picture).</p>
          </>
        )}
        {msg && <div className="text-sm rounded-lg px-3 py-2 mt-4 bg-gray-50 border border-gray-200 text-gray-800">{msg}</div>}
        {done.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-100">
            {done.map((w) => (
              <li key={w.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                <span className="truncate"><span className="text-gray-500">{fmt(w.day)}</span> — {w.title || "Draft"}</span>
                <Link href={withClient("/publishing", pickId)} className="text-xs font-semibold text-[#A8281F] hover:underline whitespace-nowrap">Review →</Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Content ideas" subtitle="Topics the AI suggests for this company from the latest analysis.">
        {!pickId ? <p className="text-sm text-gray-500">Pick a company.</p> : myIdeas.length === 0 ? (
          <p className="text-sm text-gray-500">No idea for this company in the latest analysis. Open the Chat tab and ask: &quot;Give me 5 post ideas for {clients?.find((c) => c.id === pickId)?.name || "this company"}&quot;.</p>
        ) : (
          <ul className="space-y-3">
            {myIdeas.map((i, k) => (
              <li key={k}>
                <div className="text-sm font-medium text-gray-900">{i.idea}</div>
                {i.why && <div className="text-xs text-gray-500">{i.why}</div>}
              </li>
            ))}
          </ul>
        )}
        <Link href={withClient("/knowledge-base", pickId)} className="block text-xs font-semibold text-gray-700 hover:underline mt-4">Improve what the AI knows: Knowledge Base →</Link>
      </Card>
    </div>
  );
}
