"use client";

/**
 * /settings — v0.9.0.
 *
 * Publish is opened from several computers (Olivier, 2026-10-28): some run the
 * Publish Chrome extension and it works, some have it but it is not working,
 * some don't have it — "just like we have with Social and the other platforms".
 *
 *   This computer  name it, say whether it publishes (per computer, like
 *                  Social's Collecting session), and see whether the extension
 *                  HERE is working, not working, or not installed.
 *   Computers      every Chrome that checked in for this workspace, one word
 *                  each: Working / Old version / Signed out / Offline.
 *   Intelligence   Cloudflare Workers AI status and a live test.
 *   More settings  where the other settings live.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bot, BookOpen, CheckCircle2, Laptop, Link2, Loader2, Monitor, Pencil, Puzzle, RefreshCw, Sparkles, XCircle } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Card, ago } from "@/components/publish/ui";
import { usePublishExtensionInfo, semverLt } from "@/components/layout/publish-extension-banner";
import { readLocalName, usePublishesHere, writeLocalName } from "@/lib/computer-mode";
import { EXTENSION_LATEST } from "@/lib/extension-version";
import type { BrowserView } from "@/lib/publish-dashboard";

type Computers = { latest: string; computers: BrowserView[]; canWrite: boolean };

const STATE = {
  working: { word: "Working", cls: "bg-emerald-50 text-emerald-800 border-emerald-200", dot: "bg-emerald-500" },
  out_of_date: { word: "Old version", cls: "bg-amber-50 text-amber-900 border-amber-200", dot: "bg-amber-400" },
  signed_out: { word: "Signed out", cls: "bg-red-50 text-red-800 border-red-200", dot: "bg-red-600" },
  offline: { word: "Offline", cls: "bg-gray-100 text-gray-600 border-gray-200", dot: "bg-gray-400" },
} as const;

export function SettingsClient() {
  const [data, setData] = useState<Computers | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/settings/computers", { cache: "no-store" });
      const j = await r.json();
      if (j?.success) { setData(j.data); setErr(null); } else setErr(j?.error || "Could not load the computers.");
    } catch { setErr("Could not load the computers."); }
  }, []);
  useEffect(() => { void load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  return (
    <div>
      <Header
        title="Settings"
        eyebrow="Publish"
        subtitle="This computer, every publishing computer, and Intelligence. Publish works from any computer; posts go out only from a Chrome where the Publish extension is working."
        actions={<button onClick={() => void load()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"><RefreshCw size={14} /> Refresh</button>}
      />
      {err && <div className="text-sm rounded-lg px-3 py-2 mb-4 bg-red-50 text-red-800">{err}</div>}
      <div className="space-y-5">
        <ThisComputer data={data} reload={load} />
        <AllComputers data={data} reload={load} />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <IntelligenceSettings />
          <MoreSettings />
        </div>
      </div>
    </div>
  );
}

/* ── This computer ──────────────────────────────────────────────────────── */

function ThisComputer({ data, reload }: { data: Computers | null; reload: () => void }) {
  const here = usePublishExtensionInfo();
  const [publishes, setPublishes] = usePublishesHere();
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [tick, setTick] = useState<string | null>(null);
  useEffect(() => { setName(readLocalName()); }, []);

  const mine = here.browserId && data ? data.computers.find((c) => c.id === here.browserId) || null : null;
  useEffect(() => { if (mine?.named && !readLocalName()) setName(mine.label); }, [mine]);

  const v = here.version;
  const status: { tone: "ok" | "warn" | "bad" | "off"; title: string; text: string } =
    v === null ? { tone: "off", title: "Checking this Chrome…", text: "" }
    : v === "missing" ? (publishes
        ? { tone: "bad", title: "Not installed in this Chrome", text: "This computer is set to publish, but the Publish extension is not here. Install it, or switch this computer to “viewing only” below." }
        : { tone: "off", title: "Viewing only — no extension needed", text: "This computer only views Publish. Posts go out from the publishing computers listed below." })
    : semverLt(v, EXTENSION_LATEST) ? { tone: "warn", title: `Installed, but out of date (v${v})`, text: `Update to v${EXTENSION_LATEST} — it reloads itself within about 20 minutes when its folder holds the new version, or use the Extension page.` }
    : !here.browserId ? { tone: "warn", title: `Installed (v${v})`, text: "This extension version does not say which computer it is yet. It will once it updates." }
    : !mine ? { tone: "bad", title: `Installed (v${v}) — not working yet`, text: "It has not checked in for this workspace. Stay signed in to publish.gershon.ai in this Chrome for a minute so it connects, then press “Check now”." }
    : mine.state === "working" ? { tone: "ok", title: `Working (v${v})`, text: `Checked in ${ago(mine.lastSeenAt)} · LinkedIn ${mine.linkedinSignedIn ? `signed in${mine.linkedinName ? ` as ${mine.linkedinName}` : ""}` : "signed out"} · X ${mine.xSignedIn ? (mine.x.length ? "@" + mine.x.join(", @") : "signed in") : "signed out"}.` }
    : { tone: mine.state === "out_of_date" ? "warn" : "bad", title: `Installed (v${v}) — not working`, text: mine.stateText };

  const TONE = { ok: "bg-emerald-50 border-emerald-200 text-emerald-900", warn: "bg-amber-50 border-amber-200 text-amber-900", bad: "bg-red-50 border-red-200 text-red-900", off: "bg-gray-50 border-gray-200 text-gray-700" } as const;

  const saveName = async () => {
    writeLocalName(name);
    if (here.browserId && mine && data?.canWrite) {
      const r = await fetch(`/api/settings/computers/${here.browserId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }).catch(() => null);
      setSaved(r?.ok ? "Saved — everyone sees this name." : "Saved on this computer only.");
      reload();
    } else setSaved("Saved on this computer.");
    setTimeout(() => setSaved(null), 2500);
  };

  const checkNow = () => {
    setTick("Checking…");
    const id = Math.random().toString(36).slice(2);
    const on = (e: MessageEvent) => {
      if (e.source !== window || e.data?.type !== "PUBLISH_TICK_DONE" || e.data?.requestId !== id) return;
      window.removeEventListener("message", on);
      setTick(e.data.ok ? "Done — it checked in and looked for due posts." : `It did not answer${e.data.error ? `: ${e.data.error}` : ""}.`);
      setTimeout(reload, 1500);
    };
    window.addEventListener("message", on);
    window.postMessage({ type: "PUBLISH_TICK", requestId: id }, window.location.origin);
    setTimeout(() => { window.removeEventListener("message", on); setTick((t) => (t === "Checking…" ? "No answer — the extension is not running in this Chrome." : t)); }, 15000);
  };

  return (
    <div id="this-computer">
      <Card title="This computer" subtitle="These choices apply to this computer only (this Chrome profile), like the Collecting session in Social.">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className={`lg:col-span-2 rounded-xl border px-4 py-3 ${TONE[status.tone]}`}>
            <div className="flex items-center gap-2 font-semibold text-sm">
              {status.tone === "ok" ? <CheckCircle2 size={17} /> : status.tone === "off" ? (v === null ? <Loader2 size={16} className="animate-spin" /> : <Monitor size={16} />) : <XCircle size={17} />}
              Publish extension here: {status.title}
            </div>
            {status.text && <p className="text-sm mt-1 opacity-90">{status.text}</p>}
            <div className="flex flex-wrap gap-3 mt-3">
              {v && v !== "missing" && <button onClick={checkNow} className="text-xs font-semibold rounded-md bg-white/80 border border-current/20 px-2.5 py-1 hover:bg-white">Check now</button>}
              {(v === "missing" || (v && semverLt(v, EXTENSION_LATEST))) && <Link href="/extension" className="text-xs font-semibold rounded-md bg-white/80 px-2.5 py-1 hover:bg-white">{v === "missing" ? "Install the extension" : "Update the extension"}</Link>}
              {tick && <span className="text-xs self-center">{tick}</span>}
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-700">Name of this computer</label>
              <div className="flex gap-2 mt-1">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Olivier — home PC" maxLength={60} className="flex-1 min-w-0 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" />
                <button onClick={() => void saveName()} className="rounded-lg bg-gray-900 text-white text-xs font-semibold px-3">Save</button>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">{saved || (mine ? "Shown everywhere instead of the extension's own label." : "Shown on this computer; shared once its extension checks in.")}</p>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-700">Does this computer publish?</div>
              <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden mt-1">
                <button onClick={() => setPublishes(true)} className={`px-3 py-1.5 text-xs font-medium ${publishes ? "bg-[#CC3333] text-white" : "bg-white text-gray-700"}`}>Yes — publishing computer</button>
                <button onClick={() => setPublishes(false)} className={`px-3 py-1.5 text-xs font-medium ${!publishes ? "bg-gray-900 text-white" : "bg-white text-gray-700"}`}>No — viewing only</button>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">{publishes ? "The extension is expected here; you are told when it is missing or old." : "No “not installed” notice on this computer. An old extension, if installed, is still flagged."}</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ── All computers ──────────────────────────────────────────────────────── */

function AllComputers({ data, reload }: { data: Computers | null; reload: () => void }) {
  const here = usePublishExtensionInfo();
  const [edit, setEdit] = useState<string | null>(null);
  const [val, setVal] = useState("");
  const save = async (id: string) => {
    await fetch(`/api/settings/computers/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: val }) }).catch(() => null);
    setEdit(null);
    reload();
  };
  const list = data?.computers || [];
  const count = (s: string) => list.filter((c) => c.state === s).length;
  return (
    <div id="computers">
      <Card title="Publishing computers" subtitle="Every Chrome with the extension that checked in for this workspace in the last 30 days. A post is handed only to a computer that is Working and signed in to that company's LinkedIn page or X account." right={<Link href="/extension" className="text-xs font-medium text-gray-600 hover:underline whitespace-nowrap">Extension →</Link>}>
        {!data ? <div className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</div> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {(Object.keys(STATE) as (keyof typeof STATE)[]).map((k) => (
                <div key={k} className={`rounded-lg border px-3 py-2 ${STATE[k].cls}`}>
                  <div className="text-xl font-bold tabular-nums">{count(k)}</div>
                  <div className="text-xs font-medium">{STATE[k].word}</div>
                </div>
              ))}
            </div>
            {list.length === 0 ? (
              <p className="text-sm text-gray-600">No computer has checked in yet. Install the Publish extension on the computer that should publish, then open publish.gershon.ai there once.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {list.map((c) => (
                  <li key={c.id} className="py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                    <div className="flex items-center gap-2.5 min-w-0 md:w-[34%]">
                      <Laptop size={18} className="text-gray-400 flex-shrink-0" />
                      <div className="min-w-0">
                        {edit === c.id ? (
                          <div className="flex gap-1.5">
                            <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void save(c.id); if (e.key === "Escape") setEdit(null); }} maxLength={60} className="rounded border border-gray-300 px-2 py-0.5 text-sm w-48" />
                            <button onClick={() => void save(c.id)} className="text-xs font-semibold text-[#A8281F]">Save</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-gray-900 truncate">{c.label}</span>
                            {here.browserId === c.id && <span className="text-[10px] font-bold uppercase bg-[#CC3333] text-white rounded px-1.5 py-0.5">This computer</span>}
                            {data.canWrite && <button title="Rename" onClick={() => { setEdit(c.id); setVal(c.named ? c.label : ""); }} className="text-gray-400 hover:text-gray-700"><Pencil size={12} /></button>}
                          </div>
                        )}
                        <div className="text-[11px] text-gray-400 truncate">{c.named ? c.deviceLabel : c.kind === "publish" ? "Publish extension" : "Social extension (publishing during the transition)"} · v{c.version || "?"}</div>
                      </div>
                    </div>
                    <div className="md:w-[16%]">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full border px-2 py-0.5 ${STATE[c.state].cls}`}><span className={`w-1.5 h-1.5 rounded-full ${STATE[c.state].dot}`} />{STATE[c.state].word}</span>
                    </div>
                    <div className="flex-1 text-xs text-gray-600 min-w-0">
                      <div>{c.stateText}</div>
                      <div className="text-gray-500 mt-0.5">
                        LinkedIn {c.linkedinSignedIn ? `✓${c.linkedinName ? ` ${c.linkedinName}` : ""} (${c.linkedinPages} page${c.linkedinPages === 1 ? "" : "s"})` : "signed out"} · X {c.xSignedIn ? (c.x.length ? "@" + c.x.join(", @") : "✓") : "signed out"}
                        {" "}· seen {ago(c.lastSeenAt)}{c.lastPostAt ? ` · last post ${ago(c.lastPostAt)}` : ""}
                      </div>
                      {c.lastError && <div className="text-red-700 mt-0.5 truncate" title={c.lastError}>Last error: {c.lastError}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

/* ── Intelligence ───────────────────────────────────────────────────────── */

type AI = { provider: string; available: boolean; model: string; models: { id: string }[]; test: { ok: boolean; model: string; error?: string } | null };

function IntelligenceSettings() {
  const [ai, setAi] = useState<AI | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (test = false) => {
    setBusy(test);
    try {
      const r = await fetch(`/api/settings/ai${test ? "?test=1" : ""}`, { cache: "no-store" });
      const j = await r.json();
      if (j?.success) setAi(j.data);
    } catch {} finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(false); }, [load]);
  return (
    <Card title="Intelligence" subtitle="Analysis, suggestions, chat and AI drafts run on Cloudflare Workers AI — no OpenAI or Anthropic key." right={<Link href="/intelligence" className="text-xs font-medium text-gray-600 hover:underline">Open →</Link>}>
      {!ai ? <div className="text-sm text-gray-500">Loading…</div> : (
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            {ai.available ? <CheckCircle2 size={16} className="text-emerald-600" /> : <XCircle size={16} className="text-red-600" />}
            <span>{ai.provider} — {ai.available ? "connected" : "not available on this deployment"}</span>
          </div>
          <div className="text-xs text-gray-600">Model: <code className="bg-gray-100 rounded px-1">{ai.model}</code> (shared with Social; fast 70B model used for briefings and chat, pictures by flux-1-schnell).</div>
          <div className="flex items-center gap-3 pt-1">
            <button onClick={() => void load(true)} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border border-gray-300 bg-white px-3 py-1.5 hover:bg-gray-50 disabled:opacity-60">{busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Test now</button>
            {ai.test && <span className={`text-xs ${ai.test.ok ? "text-emerald-700" : "text-red-700"}`}>{ai.test.ok ? `Answered (${ai.test.model}).` : `Failed: ${ai.test.error}`}</span>}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ── Other settings ─────────────────────────────────────────────────────── */

function MoreSettings() {
  const links = [
    { href: "/publishing/accounts", icon: Link2, label: "Connections", text: "LinkedIn pages and X accounts each company publishes to." },
    { href: "/publishing/autopilot", icon: Bot, label: "Autopilot", text: "Which companies get one post a day, post time, auto-approval delay." },
    { href: "/knowledge-base", icon: BookOpen, label: "Knowledge Base", text: "Value proposition, competitors and ICPs the AI writes from." },
    { href: "/extension", icon: Puzzle, label: "Extension", text: "Install or update the Publish Chrome extension." },
  ];
  return (
    <Card title="More settings" subtitle="Where the other settings live.">
      <ul className="space-y-2.5">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="flex items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-gray-50">
              <l.icon size={16} className="text-gray-500 mt-0.5" />
              <span><span className="text-sm font-semibold text-gray-900">{l.label}</span><span className="block text-xs text-gray-500">{l.text}</span></span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
