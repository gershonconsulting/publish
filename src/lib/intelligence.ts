/**
 * Intelligence (v0.9.0) — Cloudflare Workers AI on top of the dashboard.
 *
 * The cross-app "Intelligence" menu (Olivier, 2026-10-05): three parts —
 * 1. Analysis   what the numbers say, in plain words
 * 2. Suggestions what to do next, most useful first
 * 3. Chat       ask questions about the data and the suggestions
 * plus, for Publish, "Fill the gap": AI drafts for empty posting days
 * (lib/autopilot.ts fillGaps).
 *
 * Rules (THREE-PLATFORM-SPLIT.md §14.11):
 *   - The numbers come from the deterministic dashboard (lib/publish-dashboard.ts).
 *     The model only explains them; it never computes or changes a figure.
 *   - Links in suggestions are built HERE from the company id and the kind of
 *     action — never taken from the model.
 *   - Output is cached per workspace + company + window and labelled with its
 *     time, model and the data it saw. If AI is down, the rule-based actions
 *     are shown and labelled as such, never as AI analysis.
 *   - Only this workspace's CAMPAIGN/INTERNAL companies go into a prompt.
 */
import prisma from "@/lib/db-raw";
import { dashboard, type WindowKey } from "@/lib/publish-dashboard";
import { getAISettings, runChat, runChatJson } from "@/lib/content/provider";
import { parseModelJson } from "@/lib/content/json-repair";

const PROMPT_VERSION = "intel-v1";
const CACHE_PREFIX = "publish_intel:";
const FRESH_MS = 6 * 3600000;
const MIN_REGEN_MS = 30 * 60000;

export type SuggestionKind = "fill_gap" | "chase_approval" | "fix_delivery" | "fix_connection" | "content_idea" | "other";
export type Suggestion = {
  title: string;
  why: string;
  action: string;
  kind: SuggestionKind;
  company: string | null;
  clientId: string | null;
  href: string;
  priority: "high" | "medium" | "low";
};
export type Insight = { title: string; detail: string; tone: "ok" | "warn" | "bad" | "info"; company: string | null };
export type Idea = { company: string; clientId: string | null; idea: string; why: string };
export type Analysis = {
  headline: string;
  summary: string;
  insights: Insight[];
  suggestions: Suggestion[];
  ideas: Idea[];
  source: "ai" | "rules";
  model: string | null;
  generatedAt: string;
  window: WindowKey;
  clientId: string | null;
  promptVersion: string;
  dataHash: string;
  stale?: boolean;
  error?: string;
};

type Dash = Awaited<ReturnType<typeof dashboard>>;

// ── Facts: the compact, deterministic picture the model is allowed to see ────

export function factsOf(d: Dash) {
  const companies = d.companies.map((c) => {
    const rw = d.runway.ok ? d.runway.data.find((r) => r.clientId === c.id) : undefined;
    const ap = d.approvals.ok ? d.approvals.data.rows.find((r) => r.clientId === c.id) : undefined;
    const cn = d.connections.ok ? d.connections.data.find((r) => r.clientId === c.id) : undefined;
    const req = rw ? rw.thisMonth.required + rw.nextMonth.required : null;
    const val = rw ? Math.min(req!, rw.thisMonth.scheduled + rw.thisMonth.approved + rw.nextMonth.scheduled + rw.nextMonth.approved) : null;
    return {
      company: c.name,
      type: c.clientType,
      postsPerWeek: rw?.perWeek ?? null,
      postingDaysRequiredToEndOfNextMonth: req,
      postingDaysCovered: val,
      emptyPostingDaysNext7: rw?.neededIn7 ?? null,
      firstEmptyDay: rw?.firstGap ?? null,
      inReview: ap ? { waitingClient: ap.waitingClient, waitingInternal: ap.waitingInternal, changesRequested: ap.changesRequested, drafts: ap.drafts, oldestWaitingDays: ap.oldestWaitingDays, reviewer: ap.reviewer } : null,
      publishing: cn ? { linkedin: cn.linkedin, x: cn.x, postsAtRiskNext7: cn.atRisk } : null,
    };
  });
  return {
    period: d.windowLabel,
    score: { value: d.score.value, headline: d.score.headline, parts: d.score.parts.map((p) => ({ part: p.label, value: p.value, detail: p.detail })) },
    throughput: d.throughput.ok ? d.throughput.data : null,
    delivery: d.health.ok
      ? {
          networks: d.health.data.networks.map((n) => ({ network: n.label, published: n.published, verifiedBySocial: n.verified, failed: n.failed, missed: n.missed, stuck: n.stuck, next7: n.upcoming7 })),
          recentFailures: d.health.data.failures.slice(0, 6).map((f) => ({ company: f.company, network: f.platform, status: f.status, reason: (f.error || "").slice(0, 140) })),
        }
      : null,
    publishingComputers: d.browsers.ok ? { online: d.browsers.data.filter((b) => b.online).length, total: d.browsers.data.length, outOfDate: d.browsers.data.filter((b) => b.outOfDate).length } : null,
    last14days: d.trend.ok ? d.trend.data.reduce((a, t) => ({ created: a.created + t.created, approved: a.approved + t.approved, published: a.published + t.published, failedOrMissed: a.failedOrMissed + t.failed }), { created: 0, approved: 0, published: 0, failedOrMissed: 0 }) : null,
    companies,
  };
}

function hashOf(v: unknown): string {
  const s = JSON.stringify(v);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

function q(href: string, clientId: string | null): string {
  return clientId ? `${href}${href.includes("?") ? "&" : "?"}client=${clientId}` : href;
}

export function hrefFor(kind: SuggestionKind, clientId: string | null): string {
  switch (kind) {
    case "fill_gap": return q("/intelligence?tab=create", clientId);
    case "content_idea": return q("/intelligence?tab=create", clientId);
    case "chase_approval": return q("/publishing", clientId);
    case "fix_delivery": return q("/publishing/calendar", clientId);
    case "fix_connection": return clientId ? q("/publishing/accounts", clientId) : "/settings#computers";
    default: return q("/dashboard", clientId);
  }
}

// ── Rule-based fallback (labelled as such) ───────────────────────────────────

function rulesAnalysis(d: Dash, base: Pick<Analysis, "window" | "clientId" | "dataHash">, error?: string): Analysis {
  const byName = new Map(d.companies.map((c) => [c.name, c.id]));
  const kindOf = (href: string): SuggestionKind =>
    href.startsWith("/publishing/accounts") || href.startsWith("/extension") ? "fix_connection" : href.startsWith("/publishing/calendar") ? "fix_delivery" : /needed/.test(href) ? "fill_gap" : "chase_approval";
  const suggestions: Suggestion[] = d.actions.slice(0, 8).map((a) => {
    const needs = /needed/.test(a.text);
    const kind: SuggestionKind = needs ? "fill_gap" : kindOf(a.href);
    const clientId = a.company ? byName.get(a.company) ?? null : null;
    return {
      title: a.text, why: "", action: needs ? "Fill the empty days with AI drafts, then review them." : "Open and fix.",
      kind, company: a.company, clientId, href: needs ? hrefFor("fill_gap", clientId) : a.href,
      priority: a.severity === "critical" ? "high" : a.severity === "warning" ? "medium" : "low",
    };
  });
  return {
    headline: d.score.headline, summary: d.score.verdict, insights: [], suggestions, ideas: [],
    source: "rules", model: null, generatedAt: new Date().toISOString(), promptVersion: PROMPT_VERSION, ...base, error,
  };
}

// ── Analysis ─────────────────────────────────────────────────────────────────

const SYSTEM = `You are the head of content operations at Gershon Consulting. You read the Publish dashboard (LinkedIn and X posts for our client and internal companies) and brief the team in plain, short US English.
Rules:
- Use ONLY the facts given. Never invent numbers, companies, causes or results. If something is unknown, say so.
- Every insight names its company (or "All") and the period.
- Suggestions are concrete next actions for the team, most urgent first: fill empty posting days with AI drafts, chase a reviewer, fix a failed delivery, fix a connection or computer, or a content idea.
- Content ideas are post topics for a named company that fit what the company does and its audience; one line each, no hashtags.
- No marketing fluff. Max 8 suggestions, max 6 insights, max 6 ideas.
Answer ONLY with JSON:
{"headline": string (max 8 words), "summary": string (2-3 sentences),
 "insights": [{"title": string, "detail": string, "tone": "ok"|"warn"|"bad"|"info", "company": string|null}],
 "suggestions": [{"title": string, "why": string, "action": string, "kind": "fill_gap"|"chase_approval"|"fix_delivery"|"fix_connection"|"content_idea"|"other", "company": string|null, "priority": "high"|"medium"|"low"}],
 "ideas": [{"company": string, "idea": string, "why": string}]}`;

function cacheKey(clientId: string | null, w: WindowKey) {
  return `${CACHE_PREFIX}${clientId || "all"}:${w}`;
}

export async function readCached(orgId: string, clientId: string | null, w: WindowKey): Promise<Analysis | null> {
  const row = await prisma.orgSetting.findUnique({ where: { organizationId_key: { organizationId: orgId, key: cacheKey(clientId, w) } } }).catch(() => null);
  if (!row?.value) return null;
  try {
    const a = JSON.parse(row.value) as Analysis;
    return a.promptVersion === PROMPT_VERSION ? a : null;
  } catch {
    return null;
  }
}

async function writeCache(orgId: string, a: Analysis) {
  const key = cacheKey(a.clientId, a.window);
  const value = JSON.stringify(a);
  await prisma.orgSetting.upsert({
    where: { organizationId_key: { organizationId: orgId, key } },
    create: { organizationId: orgId, key, value },
    update: { value },
  }).catch(() => null);
}

const KINDS: SuggestionKind[] = ["fill_gap", "chase_approval", "fix_delivery", "fix_connection", "content_idea", "other"];

/**
 * The analysis for a workspace / company / window. Served from cache when the
 * data has not changed (or changed less than 30 minutes ago) and it is less
 * than 6 hours old; `refresh` forces a new AI call.
 */
export async function analyze(orgId: string, opts: { clientId: string | null; window: WindowKey; refresh?: boolean; d?: Dash }): Promise<Analysis> {
  const d = opts.d ?? (await dashboard(orgId, { window: opts.window, clientId: opts.clientId }));
  const facts = factsOf(d);
  const dataHash = hashOf(facts);
  const base = { window: opts.window, clientId: opts.clientId, dataHash };
  const cached = await readCached(orgId, opts.clientId, opts.window);
  if (cached && !opts.refresh) {
    const age = Date.now() - Date.parse(cached.generatedAt);
    if (age < FRESH_MS && (cached.dataHash === dataHash || age < MIN_REGEN_MS)) return { ...cached, stale: cached.dataHash !== dataHash };
  }
  const ai = await getAISettings();
  if (!ai.available) return cached ? { ...cached, stale: true, error: "Cloudflare AI is not available on this deployment right now." } : rulesAnalysis(d, base, "Cloudflare AI is not available on this deployment right now.");

  const ids = new Map(d.companies.map((c) => [c.name.toLowerCase(), c.id]));
  const idOf = (name: unknown) => (typeof name === "string" ? ids.get(name.toLowerCase()) ?? null : null);
  try {
    const { value, chat } = await runChatJson(ai, SYSTEM, `DASHBOARD FACTS (${facts.period}; posting days run to the end of next month):\n${JSON.stringify(facts)}`, 2500, (t) => {
      const j = parseModelJson(t) as Record<string, unknown> | null;
      if (!j || typeof j !== "object" || typeof j.summary !== "string") throw new Error("unreadable");
      return j;
    });
    const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Record<string, unknown>[] : []);
    const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
    const out: Analysis = {
      headline: str(value.headline, 80) || d.score.headline,
      summary: str(value.summary, 600),
      insights: arr(value.insights).slice(0, 6).map((i) => ({
        title: str(i.title, 120), detail: str(i.detail, 400),
        tone: (["ok", "warn", "bad", "info"].includes(String(i.tone)) ? i.tone : "info") as Insight["tone"],
        company: str(i.company, 80) || null,
      })).filter((i) => i.title),
      suggestions: arr(value.suggestions).slice(0, 8).map((s) => {
        const kind = (KINDS.includes(s.kind as SuggestionKind) ? s.kind : "other") as SuggestionKind;
        const clientId = idOf(s.company);
        return {
          title: str(s.title, 140), why: str(s.why, 300), action: str(s.action, 200), kind,
          company: clientId ? str(s.company, 80) : null, clientId, href: hrefFor(kind, clientId),
          priority: (["high", "medium", "low"].includes(String(s.priority)) ? s.priority : "medium") as Suggestion["priority"],
        };
      }).filter((s) => s.title),
      ideas: arr(value.ideas).slice(0, 6).map((i) => ({ company: str(i.company, 80), clientId: idOf(i.company), idea: str(i.idea, 200), why: str(i.why, 240) })).filter((i) => i.idea && i.clientId),
      source: "ai", model: chat.model, generatedAt: new Date().toISOString(), promptVersion: PROMPT_VERSION, ...base,
    };
    await writeCache(orgId, out);
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 200) : "The AI did not answer.";
    return cached ? { ...cached, stale: true, error: msg } : rulesAnalysis(d, base, msg);
  }
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export type ChatMessage = { role: "user" | "assistant"; content: string };

export async function chat(orgId: string, opts: { clientId: string | null; window: WindowKey; messages: ChatMessage[] }): Promise<{ answer: string; model: string }> {
  const ai = await getAISettings();
  if (!ai.available) throw new Error("Cloudflare AI is not available on this deployment right now.");
  const d = await dashboard(orgId, { window: opts.window, clientId: opts.clientId });
  const facts = factsOf(d);
  const cached = await readCached(orgId, opts.clientId, opts.window);
  const msgs = opts.messages.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-10);
  const transcript = msgs.map((m) => `${m.role === "user" ? "TEAM" : "YOU"}: ${m.content.slice(0, 2000)}`).join("\n\n");
  const system = `You are the content-operations assistant of Gershon Consulting inside Publish (LinkedIn and X posts for our client and internal companies). Answer the team's question in short, plain US English (max 180 words, bullet points welcome). Use ONLY the facts below; never invent numbers, companies or causes — say "not in the data" when needed. When useful, end with one concrete next step and the Publish page to do it on (Dashboard, Content & review, Calendar, Connections, Autopilot, Knowledge Base, Intelligence → Create content, Settings → Computers). You can draft post ideas or post text when asked; label drafts as drafts. You cannot publish, approve or change anything.

FACTS (${facts.period}):
${JSON.stringify(facts)}
${cached && cached.source === "ai" ? `\nLATEST ANALYSIS (${cached.generatedAt}): ${cached.summary}\nSuggestions: ${cached.suggestions.map((s) => s.title).join(" | ")}` : ""}`;
  const r = await runChat({ ...ai, model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" }, system, transcript || "Give me the short version of where we stand.", 900);
  return { answer: r.text.trim(), model: r.model };
}
