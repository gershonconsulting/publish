"use client";

/**
 * /knowledge-base (v4.51.0) — per company: Value Prop · Competitive Landscape ·
 * ICPs. Left: the Publishing companies, each opening its three sections.
 * Right: the section — editable, "Draft with Intelligence" fills or rewrites
 * it. The Competitive Landscape also shows, live, what the tracked
 * competitors are posting about (from the collected posts).
 * Autopilot reads all three before writing a post.
 *
 * v0.10.0 — 4th section "House Style": the company's own posts collected by
 * social.gershon.ai from BEFORE Gershon took over (numbers, best posts) and a
 * style guide drafted from them, so our posts keep the company's voice.
 */

import { useSelectedClient } from "@/lib/selected-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Building2, ChevronDown, ChevronRight, ClipboardPaste, FileUp, History, Loader2, Plus, Save, Sparkles, Swords, Target, Trash2, Wand2 } from "lucide-react";

type Source = "ai" | "manual";
type Icp = { id: string; name: string; description: string; source: Source; updatedAt: string; from?: string };
type KB = {
  valueProp: { text: string; source: Source; updatedAt: string | null };
  competitive: { notes: string; source: Source; updatedAt: string | null };
  icps: Icp[];
  style: { text: string; source: Source; updatedAt: string | null; takeover: string | null };
};
type Stats = {
  posts: number; firstDate: string | null; lastDate: string | null; perWeek: number | null;
  byPlatform: Array<{ platform: string; posts: number }>; withText: number;
  avgChars: number | null; medianChars: number | null; avgParagraphs: number | null; avgHashtags: number | null;
  topHashtags: Array<{ tag: string; count: number }>;
  emojiPct: number | null; linkPct: number | null; questionPct: number | null; mediaPct: number | null;
  voice: { we: number; i: number; you: number; main: string } | null;
  avgEngagement: number | null; bestWeekday: string | null;
  topPosts: Array<{ date: string; platform: string; text: string; engagement: number; url: string | null }>;
  examples: string[];
};
type History = {
  takeover: { date: string | null; source: "manual" | "campaign-start" | "first-delivery" | "none" };
  stats: Stats; excludedOurs: number; afterTakeover: number;
} | null;
type Snapshot = {
  competitors: Array<{ id: string; name: string; posts: number; perWeek: number; topThemes: string[]; keywords: string[] }>;
  themes: Array<{ label: string; self: number; competitors: number }>;
  gaps: string[];
  owned: string[];
  topPosts: Array<{ company: string; date: string; text: string; engagement: number; url: string | null }>;
  linkedVia: string;
  windowDays: number;
} | null;
type Company = { id: string; name: string; clientType: string; hasValueProp: boolean; hasCompetitive: boolean; hasStyle?: boolean; icps: { id: string; name: string }[] };
type View = "valueProp" | "competitive" | "icps" | "style";
const VIEW_TITLE: Record<View, string> = { valueProp: "Value Prop", competitive: "Competitive Landscape", icps: "ICPs", style: "House Style (before Gershon)" };

function AiTag({ s }: { s: Source }) {
  return s === "ai" ? <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200">AI draft</span> : null;
}

export function KnowledgeBaseClient() {
  const params = useSearchParams();
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [open, setOpen] = useState<string>("");
  // v0.3.0: follows the client picked in the left-menu client list.
  const { clientId: menuClient, setClientId: setMenuClient } = useSelectedClient();
  const [view, setView] = useState<View>("valueProp");
  const [kb, setKb] = useState<KB | null>(null);
  const [snap, setSnap] = useState<Snapshot>(null);
  const [history, setHistory] = useState<History>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // v4.59.0 audit: load errors are shown instead of an endless spinner.
  const [listErr, setListErr] = useState<string | null>(null);
  const [kbErr, setKbErr] = useState<string | null>(null);
  // v4.59.0 audit: the company whose KB was last requested — a slower response
  // for an earlier company must not show (or later be saved) under this one.
  const wanted = useRef("");

  const loadList = useCallback(async () => {
    try {
      const r = await fetch("/api/knowledge-base", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) throw new Error(j?.error || `Could not load the companies (HTTP ${r.status}).`);
      setListErr(null);
      setCompanies(j.data.companies);
      setCanWrite(j.data.canWrite);
      setOpen((o) => o || params.get("c") || j.data.companies.find((c: Company) => /gershon/i.test(c.name))?.id || j.data.companies[0]?.id || "");
    } catch (e) {
      setListErr(e instanceof Error ? e.message : "Could not load the companies.");
    }
  }, [params]);
  useEffect(() => { void loadList(); }, [loadList]);

  const loadKb = useCallback(async (id: string) => {
    wanted.current = id;
    if (!id) return;
    setKb(null); setSnap(null); setHistory(null); setMsg(null); setDirty(false); setKbErr(null);
    try {
      const r = await fetch(`/api/knowledge-base/${id}`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (wanted.current !== id) return;
      if (!r.ok || !j?.success) throw new Error(j?.error || `Could not load this Knowledge Base (HTTP ${r.status}).`);
      setKb(j.data.kb); setSnap(j.data.snapshot); setHistory(j.data.history ?? null);
    } catch (e) {
      if (wanted.current !== id) return;
      setKbErr(e instanceof Error ? e.message : "Could not load this Knowledge Base.");
    }
  }, []);
  useEffect(() => { void loadKb(open); }, [open, loadKb]);
  useEffect(() => {
    if (menuClient && menuClient !== open && companies?.some((c) => c.id === menuClient)) pick(menuClient);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuClient, companies]);

  // v4.59.0 audit: switching company drops unsaved edits — ask first.
  function pick(id: string) {
    if (id === open) { setView("valueProp"); return; }
    if (dirty && !confirm("Discard unsaved edits?")) return;
    if (id !== menuClient) setMenuClient(id);
    setOpen(id); setView("valueProp");
  }

  const current = useMemo(() => companies?.find((c) => c.id === open), [companies, open]);

  async function save() {
    if (!kb) return;
    setBusy("save"); setMsg(null);
    try {
      const id = open;
      const r = await fetch(`/api/knowledge-base/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(kb) });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.error || "Could not save.");
      // v4.59.0 audit: don't paint this company's KB over another one opened meanwhile.
      if (wanted.current === id) { setKb(j.data.kb); setDirty(false); setMsg("Saved."); }
      // The takeover date decides which collected posts count — re-read them.
      if (wanted.current === id) void fetch(`/api/knowledge-base/${id}`, { cache: "no-store" }).then((x) => x.json()).then((x) => { if (wanted.current === id && x?.success) setHistory(x.data.history ?? null); }).catch(() => {});
      void loadList();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not save."); }
    setBusy(null);
  }

  async function draft(section: View | "all") {
    if (dirty && !confirm("You have unsaved edits — Intelligence will replace this section. Continue?")) return;
    setBusy("draft:" + section); setMsg("Intelligence is drafting…");
    try {
      const id = open;
      const r = await fetch(`/api/knowledge-base/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ section, overwrite: section !== "all" }) });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.error || "Intelligence failed.");
      // v4.59.0 audit: only show the draft if the same company is still open.
      if (wanted.current === id) { setKb(j.data.kb); setDirty(false); setMsg("Drafted — read it, edit what's wrong, and save."); }
      void loadList();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Intelligence failed."); }
    setBusy(null);
  }

  // v0.10.0: the House Style guide drafts itself the first time it is opened
  // with enough collected posts — nobody has to press the button.
  const autoDrafted = useRef(new Set<string>());
  useEffect(() => {
    if (view !== "style" || !kb || !canWrite || busy || dirty || kb.style.text.trim()) return;
    if (!history || history.stats.withText < 3 || autoDrafted.current.has(open)) return;
    autoDrafted.current.add(open);
    void draft("style");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, kb, history, canWrite, busy, dirty, open]);

  const edit = (f: (k: KB) => KB) => { setKb((k) => (k ? f(structuredClone(k)) : k)); setDirty(true); };

  return (
    <div>
      <Header
        title="Knowledge Base"
        eyebrow="Publishing"
        subtitle="What every campaign is built on: the company's value proposition, what its competitors post about, and the ICPs we target. Autopilot writes from it."
      />
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
        <nav className="rounded-xl border border-gray-200 bg-white p-2 h-fit">
          {!companies && !listErr && <Loader2 className="animate-spin text-gray-400 m-3" />}
          {!companies && listErr && (
            <div className="m-2 text-sm text-red-700">
              {listErr} <button onClick={() => { setListErr(null); void loadList(); }} className="underline ml-1">Retry</button>
            </div>
          )}
          {companies && companies.length === 0 && (
            <p className="m-2 text-sm text-gray-500">No campaign or internal companies yet.</p>
          )}
          {companies?.map((c) => {
            const isOpen = c.id === open;
            return (
              <div key={c.id} className="mb-1">
                <button onClick={() => pick(c.id)} className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left text-sm ${isOpen ? "font-semibold text-gray-900" : "text-gray-700 hover:bg-gray-50"}`}>
                  <Building2 size={15} className="shrink-0" />
                  <span className="truncate">{c.name}</span>
                  <span className="ml-auto text-[10px] text-gray-400">{c.clientType === "INTERNAL" ? "internal" : "campaign"}</span>
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {isOpen && (
                  <div className="ml-4 border-l border-gray-200 pl-2 space-y-0.5">
                    {([
                      ["valueProp", Sparkles, "Value Prop", c.hasValueProp],
                      ["competitive", Swords, "Competitive Landscape", c.hasCompetitive],
                      ["icps", Target, `ICPs (${c.icps.length})`, c.icps.length > 0],
                      ["style", History, "House Style", !!c.hasStyle],
                    ] as const).map(([v, Icon, label, filled]) => (
                      <button key={v} onClick={() => setView(v)} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm ${view === v ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-50"}`}>
                        <Icon size={14} /> {label}
                        {!filled && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-500" title="Empty" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <section className="rounded-xl border border-gray-200 bg-white p-5 min-h-[420px]">
          {/* v4.59.0 audit: spinner only while something is actually loading. */}
          {!kb && kbErr && (
            <p className="text-sm text-red-700">
              {kbErr} <button onClick={() => void loadKb(open)} className="underline ml-1">Retry</button>
            </p>
          )}
          {!kb && !kbErr && companies && companies.length === 0 && (
            <p className="text-sm text-gray-500">Nothing to show — there is no company with publishing yet.</p>
          )}
          {!kb && !kbErr && !listErr && !(companies && companies.length === 0) && <Loader2 className="animate-spin text-gray-400" />}
          {kb && current && (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  {current.name} — {VIEW_TITLE[view]}
                </h2>
                {view === "valueProp" && <AiTag s={kb.valueProp.source} />}
                {view === "competitive" && <AiTag s={kb.competitive.source} />}
                {view === "style" && <AiTag s={kb.style.source} />}
                {canWrite && (
                  <div className="ml-auto flex gap-2">
                    <button disabled={!!busy} onClick={() => draft(view)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg disabled:opacity-50">
                      {busy === "draft:" + view ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Draft with Intelligence
                    </button>
                    <button disabled={!!busy || !dirty} onClick={save} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-gray-900 rounded-lg disabled:opacity-40">
                      {busy === "save" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
                    </button>
                  </div>
                )}
              </div>
              {msg && <p className="text-sm text-gray-600 mb-3">{msg}</p>}

              {view === "valueProp" && (
                <>
                  <p className="text-xs text-gray-500 mb-2">Positioning, who it is for, the problem, how it solves it, proof points, the promise. Every Autopilot post carries it.</p>
                  <textarea
                    value={kb.valueProp.text}
                    readOnly={!canWrite}
                    onChange={(e) => edit((k) => ({ ...k, valueProp: { ...k.valueProp, text: e.target.value } }))}
                    rows={16}
                    placeholder="Empty — press “Draft with Intelligence”."
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm leading-relaxed"
                  />
                </>
              )}

              {view === "competitive" && (
                <div className="space-y-5">
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Positioning notes — how we answer competitors. Autopilot uses these plus the live data below.</p>
                    <textarea
                      value={kb.competitive.notes}
                      readOnly={!canWrite}
                      onChange={(e) => edit((k) => ({ ...k, competitive: { ...k.competitive, notes: e.target.value } }))}
                      rows={8}
                      placeholder="Empty — press “Draft with Intelligence”."
                      className="w-full border border-gray-300 rounded-lg p-3 text-sm leading-relaxed"
                    />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">What competitors are posting (last {snap?.windowDays ?? 90} days, live)</h3>
                    {!snap || !snap.competitors.length ? (
                      // v4.59.0 audit: the Competitor Watch tab only exists on INTERNAL companies.
                      <p className="text-sm text-amber-700">
                        {current.clientType === "INTERNAL"
                          ? <>No competitors linked to this company yet — add them in the company&apos;s Competitor Watch tab and their posts appear here.</>
                          : <>No competitors linked to this company yet. Competitors are tracked from an Internal company&apos;s Competitor Watch tab — ask Gershon to add this company&apos;s competitors and their posts appear here.</>}
                      </p>
                    ) : (
                      <div className="space-y-4">
                        <table className="w-full text-sm">
                          <thead className="text-left text-gray-500"><tr><th className="py-1">Competitor</th><th>Posts / week</th><th>Talks about</th><th>Key words</th></tr></thead>
                          <tbody>
                            {snap.competitors.map((c) => (
                              <tr key={c.id} className="border-t border-gray-100 align-top">
                                <td className="py-1.5 font-medium">{c.name}</td>
                                <td>{c.perWeek}</td>
                                <td>{c.topThemes.join(", ") || "—"}</td>
                                <td className="text-gray-600">{c.keywords.slice(0, 6).join(", ")}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {snap.gaps.length > 0 && <p className="text-sm"><b>Gaps to take</b> (they post about it, we don&apos;t): {snap.gaps.join(", ")}</p>}
                        {snap.owned.length > 0 && <p className="text-sm"><b>Our own ground:</b> {snap.owned.join(", ")}</p>}
                        {snap.topPosts.length > 0 && (
                          <div>
                            <div className="text-sm font-semibold mb-1">Their best posts</div>
                            {snap.topPosts.map((p, i) => (
                              <blockquote key={i} className="border-l-2 border-gray-200 pl-3 my-2 text-sm text-gray-700">
                                <div className="text-xs text-gray-500">{p.company} · {p.date} · {p.engagement} engagement {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="underline ml-1">open</a>}</div>
                                {p.text}
                              </blockquote>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {view === "style" && (
                <HouseStyleView
                  company={current.name}
                  kb={kb}
                  history={history}
                  canWrite={canWrite}
                  onText={(t) => edit((k) => ({ ...k, style: { ...k.style, text: t } }))}
                  onTakeover={(d) => edit((k) => ({ ...k, style: { ...k.style, takeover: d } }))}
                />
              )}

              {view === "icps" && (
                <div className="space-y-4">
                  <p className="text-xs text-gray-500">Each Autopilot post is written for one ICP, in rotation.</p>
                  {canWrite && <IcpUpload clientId={open} dirty={dirty} onDone={(k, n, from) => { setKb(k); setDirty(false); setMsg(`${n} ICP${n === 1 ? "" : "s"} added from “${from}”.`); void loadList(); }} />}
                  {!kb.icps.length && <p className="text-sm text-amber-700">No ICP yet — press “Draft with Intelligence” or add one.</p>}
                  {kb.icps.map((icp, idx) => (
                    <div key={icp.id || idx} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Target size={14} className="text-gray-500" />
                        <input
                          value={icp.name}
                          readOnly={!canWrite}
                          onChange={(e) => edit((k) => { k.icps[idx].name = e.target.value; return k; })}
                          className="flex-1 font-medium text-sm border-b border-transparent focus:border-gray-300 outline-none"
                        />
                        <AiTag s={icp.source} />
                        {icp.from && <span className="text-[11px] text-gray-500 truncate max-w-[200px]" title={icp.from}>from {icp.from}</span>}
                        {canWrite && <button onClick={() => edit((k) => { k.icps.splice(idx, 1); return k; })} className="text-gray-400 hover:text-red-600" title="Remove"><Trash2 size={14} /></button>}
                      </div>
                      <textarea
                        value={icp.description}
                        readOnly={!canWrite}
                        onChange={(e) => edit((k) => { k.icps[idx].description = e.target.value; return k; })}
                        rows={6}
                        className="w-full border border-gray-300 rounded-lg p-2 text-sm"
                      />
                    </div>
                  ))}
                  {canWrite && (
                    <button onClick={() => edit((k) => { k.icps.push({ id: "", name: "New ICP — <Job title> at <company type>", description: "Company:\nRole & seniority:\nPains:\nTriggers to buy now:\nWhat they need to hear from us:", source: "manual", updatedAt: new Date().toISOString() }); return k; })} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-lg">
                      <Plus size={14} /> Add an ICP
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/** Upload a file or paste text → Intelligence adds the ICPs it finds (v4.53.0). */
function IcpUpload({ clientId, dirty, onDone }: { clientId: string; dirty: boolean; onDone: (kb: KB, added: number, from: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [paste, setPaste] = useState<string | null>(null);
  const [docs, setDocs] = useState<Array<{ from: string; uploadedAt: string; chars: number }>>([]);
  useEffect(() => {
    void fetch(`/api/knowledge-base/${clientId}/icp-upload`, { cache: "no-store" }).then((r) => r.json()).then((j) => j?.success && setDocs(j.data.docs)).catch(() => {});
  }, [clientId]);

  async function send(body: FormData | string) {
    if (dirty && !confirm("You have unsaved edits — they will be lost. Continue?")) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/knowledge-base/${clientId}/icp-upload`, typeof body === "string"
        ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: body, name: "Pasted text" }) }
        : { method: "POST", body });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.error || "Could not read it.");
      setDocs(j.data.docs); setPaste(null);
      onDone(j.data.kb, j.data.added, j.data.from);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not read it."); }
    setBusy(false);
  }

  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-gray-800">Upload ICP information</span>
        <span className="text-xs text-gray-500">PDF, Word, Excel, CSV or text — Intelligence adds the ICPs it finds.</span>
        <label className={`ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 bg-white cursor-pointer ${busy ? "opacity-50 pointer-events-none" : ""}`}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />} Upload a file
          <input type="file" className="hidden" accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.md,.pptx,.odt" onChange={(e) => {
            const f = e.target.files?.[0]; e.target.value = "";
            if (!f) return;
            const fd = new FormData(); fd.append("file", f); void send(fd);
          }} />
        </label>
        <button disabled={busy} onClick={() => setPaste(paste === null ? "" : null)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 bg-white"><ClipboardPaste size={14} /> Paste text</button>
      </div>
      {paste !== null && (
        <div className="mt-2">
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={6} placeholder="Paste the ICP brief, persona descriptions, target list criteria…" className="w-full border border-gray-300 rounded-lg p-2 text-sm" />
          <button disabled={busy || paste.trim().length < 40} onClick={() => void send(paste)} className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-gray-900 rounded-lg disabled:opacity-40">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Find the ICPs
          </button>
        </div>
      )}
      {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
      {docs.length > 0 && (
        <p className="mt-2 text-xs text-gray-500">Uploaded: {docs.slice(0, 5).map((d) => `${d.from} (${new Date(d.uploadedAt).toLocaleDateString()})`).join(" · ")}</p>
      )}
    </div>
  );
}

// ── House Style (v0.10.0) ────────────────────────────────────────────────────

const TAKEOVER_SOURCE: Record<string, string> = {
  manual: "date typed here",
  "campaign-start": "campaign start date",
  "first-delivery": "first post we published",
  none: "we have never published for this company",
};
const PLAT: Record<string, string> = { LINKEDIN: "LinkedIn", TWITTER: "X" };

function Tile({ label, value, hint }: { label: string; value: string | null; hint: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-xl font-semibold text-gray-900 mt-0.5">{value ?? <span className="text-gray-400 text-base font-normal">Not measurable</span>}</div>
      <div className="text-xs text-gray-500 mt-1 leading-snug">{hint}</div>
    </div>
  );
}

function HouseStyleView({ company, kb, history, canWrite, onText, onTakeover }: {
  company: string; kb: KB; history: History; canWrite: boolean;
  onText: (t: string) => void; onTakeover: (d: string | null) => void;
}) {
  const s = history?.stats;
  const t = history?.takeover;
  const pctOf = (v: number | null) => (v === null ? null : `${v}%`);
  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-500">
        How {company} wrote <b>before Gershon took over</b> its publishing — from its own posts collected by{" "}
        <a href="https://social.gershon.ai" target="_blank" rel="noreferrer" className="underline">social.gershon.ai</a>.
        Autopilot, Fill the gap and revisions write in this voice.
      </p>

      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-gray-700">
          {t && !t.date
            ? <>Gershon has not published for {company} yet — every collected post is its own.</>
            : <>Gershon took over on <b>{t?.date ?? "—"}</b>{t && <span className="text-gray-500"> ({TAKEOVER_SOURCE[t.source]})</span>} — only posts from before that date count.</>}
        </span>
        {canWrite && (
          <span className="ml-auto flex items-center gap-2">
            <label className="text-xs text-gray-500">Change:</label>
            <input type="date" value={kb.style.takeover ?? ""} onChange={(e) => onTakeover(e.target.value || null)} className="border border-gray-300 rounded px-2 py-1 text-sm" />
            {kb.style.takeover && <button onClick={() => onTakeover(null)} className="text-xs underline text-gray-600">Automatic</button>}
            <span className="text-xs text-gray-400">then Save</span>
          </span>
        )}
      </div>

      {!history && <p className="text-sm text-red-700">Unavailable — the posts collected by social.gershon.ai could not be read right now.</p>}

      {history && s && s.posts === 0 && (
        <p className="text-sm text-amber-700">
          social.gershon.ai has not collected any post of {company}{t?.date ? ` from before ${t.date}` : ""} yet.
          Collect its history there (its LinkedIn page / X account), then come back — the numbers and the style guide fill in.
        </p>
      )}

      {history && s && s.posts > 0 && (
        <>
          <div className="text-sm text-gray-700">
            <b>{s.posts}</b> posts of {company} from <b>{s.firstDate}</b> to <b>{s.lastDate}</b>
            {" "}({s.byPlatform.map((b) => `${b.posts} ${PLAT[b.platform] ?? b.platform}`).join(", ")}).
            {history.excludedOurs > 0 && <span className="text-gray-500"> {history.excludedOurs} post{history.excludedOurs === 1 ? "" : "s"} we published left out.</span>}
            {history.afterTakeover > 0 && <span className="text-gray-500"> {history.afterTakeover} collected after the takeover are not used here.</span>}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile label="Rhythm" value={s.perWeek === null ? null : `${s.perWeek} / week`} hint="How often they posted. Under 2 weeks of history: not measurable." />
            <Tile label="Length" value={s.avgChars === null ? null : `${s.avgChars} chars`} hint={s.medianChars === null ? "Average post length." : `Median ${s.medianChars} characters, ${s.avgParagraphs} paragraphs/lines.`} />
            <Tile label="Hashtags" value={s.avgHashtags === null ? null : `${s.avgHashtags} / post`} hint="Average hashtags per post." />
            <Tile label="Voice" value={s.voice ? (s.voice.main === "mixed" ? "Mixed" : `“${s.voice.main}”`) : null} hint={s.voice ? `we ${s.voice.we}% · I ${s.voice.i}% · you ${s.voice.you}%` : "Too little text to tell."} />
            <Tile label="Emoji" value={pctOf(s.emojiPct)} hint="Share of posts with at least one emoji." />
            <Tile label="Links" value={pctOf(s.linkPct)} hint="Share of posts with a web link." />
            <Tile label="Questions" value={pctOf(s.questionPct)} hint="Share of posts that ask the reader something." />
            <Tile label="Pictures / video" value={pctOf(s.mediaPct)} hint={s.bestWeekday ? `Best day for engagement: ${s.bestWeekday}.` : "Share of posts with a picture or video."} />
          </div>

          {s.topHashtags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-sm font-semibold text-gray-900 mr-1">Their hashtags</span>
              {s.topHashtags.map((h) => <span key={h.tag} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{h.tag} · {h.count}</span>)}
            </div>
          )}
        </>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Style guide</h3>
        <p className="text-xs text-gray-500 mb-2">Tone, voice, structure, vocabulary, what worked — “Draft with Intelligence” writes it from the posts above; edit what&apos;s wrong and save.</p>
        <textarea
          value={kb.style.text}
          readOnly={!canWrite}
          onChange={(e) => onText(e.target.value)}
          rows={12}
          placeholder={s && s.posts ? "Empty — press “Draft with Intelligence”." : "Empty — needs collected posts first (or write it yourself)."}
          className="w-full border border-gray-300 rounded-lg p-3 text-sm leading-relaxed"
        />
      </div>

      {s && (s.topPosts.length > 0 || s.examples.length > 0) && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">{s.topPosts.length ? "Their best posts (before Gershon)" : "Their latest posts (before Gershon) — no engagement collected"}</h3>
          {s.topPosts.length
            ? s.topPosts.map((p, i) => (
                <blockquote key={i} className="border-l-2 border-gray-200 pl-3 my-2 text-sm text-gray-700 whitespace-pre-line">
                  <div className="text-xs text-gray-500">{PLAT[p.platform] ?? p.platform} · {p.date} · {p.engagement} engagement {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="underline ml-1">open</a>}</div>
                  {p.text}
                </blockquote>
              ))
            : s.examples.slice(0, 4).map((x, i) => (
                <blockquote key={i} className="border-l-2 border-gray-200 pl-3 my-2 text-sm text-gray-700 whitespace-pre-line">{x}</blockquote>
              ))}
        </div>
      )}
    </div>
  );
}
