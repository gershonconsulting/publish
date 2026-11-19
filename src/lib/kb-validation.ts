/**
 * Knowledge validation — storage, private links and team alerts (v0.16.0).
 * Logic lives in lib/kb-validation-logic.ts (pure, tested).
 *
 * Stored in OrgSetting, no schema change:
 *   kbval:<clientId>               → ValState JSON (verdicts per level + releasedAt)
 *   kbreview_internal:<clientId>   → ki_… token (the team member's private link)
 *   kbreview_client:<clientId>     → kc_… token (the client's private link)
 * Rotating a link (Knowledge Base → Validation) revokes the old one.
 * Publish never emails these links to anyone: the team sends them.
 */
import prisma from "@/lib/db-raw";
import { getKB, saveKB, type KnowledgeBase } from "@/lib/knowledge-base";
import { parseBrandText } from "@/lib/brand";
import { PUBLISHING_CLIENT_WHERE, alertTeamBurst, esc } from "@/lib/publishing";
import { PUBLISH_ORIGIN, publishLink } from "@/lib/publishing-mail";
import {
  applyVerdict, currentVerdict, parseState, sectionsOf, statusOf, summarize, levelOfToken,
  type KBSection, type Level, type SectionStatus, type Summary, type ValState, type Verdict, type VerdictStatus,
  releaseNow,
  kbGaps,
} from "@/lib/kb-validation-logic";

const stateKey = (clientId: string) => `kbval:${clientId}`;
const tokenKey = (level: Level, clientId: string) => `kbreview_${level}:${clientId}`;

async function upsert(orgId: string, key: string, value: string) {
  await prisma.orgSetting.upsert({
    where: { organizationId_key: { organizationId: orgId, key } },
    create: { organizationId: orgId, key, value },
    update: { value },
  });
}

export async function getValState(orgId: string, clientId: string): Promise<ValState> {
  const row = await prisma.orgSetting.findUnique({ where: { organizationId_key: { organizationId: orgId, key: stateKey(clientId) } } });
  return parseState(row?.value);
}

function mint(level: Level): string {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return (level === "internal" ? "ki_" : "kc_") + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function kbReviewToken(orgId: string, clientId: string, level: Level, rotate = false): Promise<string> {
  if (!rotate) {
    const row = await prisma.orgSetting.findUnique({ where: { organizationId_key: { organizationId: orgId, key: tokenKey(level, clientId) } } });
    if (row?.value && levelOfToken(row.value) === level) return row.value;
  }
  const t = mint(level);
  await upsert(orgId, tokenKey(level, clientId), t);
  return t;
}

export function kbReviewUrl(token: string): string {
  return `${PUBLISH_ORIGIN}/kb-review/${token}`;
}

export async function resolveKbReviewToken(token: string): Promise<{ orgId: string; clientId: string; level: Level } | null> {
  const level = levelOfToken(token);
  if (!level) return null;
  const row = await prisma.orgSetting.findFirst({ where: { key: { startsWith: `kbreview_${level}:` }, value: token } });
  if (!row?.organizationId) return null;
  const clientId = row.key.slice(`kbreview_${level}:`.length);
  const client = await prisma.client.findFirst({ where: { id: clientId, organizationId: row.organizationId, archivedAt: null }, select: { id: true } });
  return client ? { orgId: row.organizationId, clientId, level } : null;
}

export type SectionView = KBSection & { status: SectionStatus; verdict: Verdict | null; internal?: { status: SectionStatus; verdict: Verdict | null } };

function viewOf(sections: KBSection[], verdicts: Record<string, Verdict>): SectionView[] {
  return sections.map((s) => ({ ...s, status: statusOf(s, verdicts[s.id]), verdict: currentVerdict(s, verdicts[s.id]) ?? verdicts[s.id] ?? null }));
}

/** What the private review page shows for one level. */
export async function reviewPage(orgId: string, clientId: string, level: Level) {
  const [kb, state, client, org] = await Promise.all([
    getKB(orgId, clientId),
    getValState(orgId, clientId),
    prisma.client.findFirst({ where: { id: clientId }, select: { name: true, logoUrl: true } }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
  ]);
  const sections = sectionsOf(kb);
  const open = level === "internal" || !!state.releasedAt;
  return {
    level,
    client: client?.name || "",
    logoUrl: client?.logoUrl || null,
    agency: org?.name || "",
    open,
    sections: open ? viewOf(sections, state[level]) : [],
    summary: summarize(sections, state[level]),
  };
}

/** What the team sees in Knowledge Base → Validation. */
export async function validationOverview(orgId: string, clientId: string) {
  const [kb, state, ti, tc] = await Promise.all([
    getKB(orgId, clientId),
    getValState(orgId, clientId),
    kbReviewToken(orgId, clientId, "internal"),
    kbReviewToken(orgId, clientId, "client"),
  ]);
  const sections = sectionsOf(kb);
  return {
    releasedAt: state.releasedAt,
    releasedBy: state.releasedBy ?? null,
    gaps: kbGaps(kb),
    internal: { url: kbReviewUrl(ti), summary: summarize(sections, state.internal) },
    client: { url: kbReviewUrl(tc), summary: summarize(sections, state.client), open: !!state.releasedAt },
    sections: sections.map((s) => ({
      id: s.id, title: s.title, kind: s.kind,
      internal: { status: statusOf(s, state.internal[s.id]), verdict: state.internal[s.id] ?? null },
      client: { status: statusOf(s, state.client[s.id]), verdict: state.client[s.id] ?? null },
    })),
  };
}

/** The internal reviewer may correct the text herself: it is saved to the Knowledge Base as a manual edit. */
function withText(kb: KnowledgeBase, sectionId: string, text: string): KnowledgeBase | null {
  const now = new Date().toISOString();
  const t = text.slice(0, 6000);
  if (sectionId === "valueProp") return { ...kb, valueProp: { text: t, source: "manual", updatedAt: now } };
  if (sectionId === "competitive") return { ...kb, competitive: { notes: t, source: "manual", updatedAt: now } };
  if (sectionId === "brand") return { ...kb, brand: parseBrandText(t, kb.brand, now) };
  if (sectionId === "style") return { ...kb, style: { ...kb.style, text: t, source: "manual", updatedAt: now } };
  if (sectionId.startsWith("icp:")) {
    const id = sectionId.slice(4);
    if (!kb.icps.some((i) => i.id === id)) return null;
    return { ...kb, icps: kb.icps.map((i) => (i.id === id ? { ...i, description: t.slice(0, 4000), source: "manual" as const, updatedAt: now } : i)) };
  }
  return null;
}

export async function submitVerdict(
  orgId: string,
  clientId: string,
  level: Level,
  input: { section: string; status: VerdictStatus; comment?: string | null; name?: string | null; text?: string | null },
): Promise<{ error: string } | { summary: Summary; completedNow: boolean }> {
  let kb = await getKB(orgId, clientId);
  if (typeof input.text === "string") {
    if (level !== "internal") return { error: "Only the Gershon team can edit the text here." };
    const edited = withText(kb, input.section, input.text);
    if (!edited) return { error: "This section does not exist any more. Reload the page." };
    kb = await saveKB(orgId, clientId, edited);
  }
  const sections = sectionsOf(kb);
  const state = await getValState(orgId, clientId);
  const r = applyVerdict(state, sections, level, input);
  if ("error" in r) return r;
  await upsert(orgId, stateKey(clientId), JSON.stringify(r.state));
  const summary = summarize(sections, r.state[level]);
  await notify(orgId, clientId, level, sections.find((s) => s.id === input.section)!, r.state[level][input.section], summary, r.completedNow).catch(() => false);
  return { summary, completedNow: r.completedNow };
}

/** PUB-214 to the team inbox: a section needs changes, or a level is complete. */
async function notify(orgId: string, clientId: string, level: Level, s: KBSection, v: Verdict, summary: Summary, completedNow: boolean) {
  if (v.status !== "changes" && !completedNow) return false;
  const client = await prisma.client.findFirst({ where: { id: clientId }, select: { name: true } });
  const who = v.name ? esc(v.name) : level === "client" ? "The client" : "The internal reviewer";
  const lvl = level === "client" ? "client" : "internal";
  const subject = completedNow
    ? `${client?.name || "Company"} knowledge: ${lvl} validation complete`
    : `${client?.name || "Company"} knowledge: changes asked on "${s.title}" (${lvl})`;
  const body = completedNow
    ? `<p>${who} validated all ${summary.total} sections of the ${esc(client?.name || "")} Knowledge Base (${lvl} check).</p>` +
      (level === "internal" ? `<p>The client's review link is now open. Publish does not send it: copy it from Knowledge Base → Validation.</p>` : "")
    : `<p>${who} asked for changes on <b>${esc(s.title)}</b> (${lvl} check):</p><blockquote style="border-left:3px solid #ddd;margin:8px 0;padding:4px 10px;color:#333">${esc(v.comment).replace(/\n/g, "<br>")}</blockquote>
       <p>${summary.ok} of ${summary.total} sections validated so far. Edit the section in the Knowledge Base; it then goes back to "to check" for the reviewer.</p>`;
  // v0.18.2: one key per (section, level, verdict text); updates within 10 minutes are grouped.
  return alertTeamBurst(orgId, clientId, "KB_VALIDATION", subject, `${client?.name || "Company"} knowledge: {n} updates (${lvl})`, body,
    { href: publishLink("/knowledge-base", { client: clientId }), label: "Open the Knowledge Base" },
    [level, completedNow ? "complete" : s.id, v.status, v.comment]);
}

/** v0.23.0: the team opens the client link now, without waiting for the internal check. */
export async function releaseClientLink(orgId: string, clientId: string, by: string | null): Promise<void> {
  const state = await getValState(orgId, clientId);
  if (state.releasedAt) return;
  await upsert(orgId, stateKey(clientId), JSON.stringify(releaseNow(state, by)));
}

export type KbLinkRow = {
  clientId: string; name: string; clientType: string;
  sections: number; gaps: string[];
  internal: { url: string; ok: number; total: number; complete: boolean };
  client: { url: string; ok: number; changes: number; total: number; complete: boolean; open: boolean; releasedBy: string | null };
};

/** v0.23.0: one line per company — its client validation link, what is empty, where validation stands. */
export async function kbLinks(orgId: string): Promise<KbLinkRow[]> {
  const clients = await prisma.client.findMany({
    where: { organizationId: orgId, archivedAt: null, status: { not: "ARCHIVED" }, ...PUBLISHING_CLIENT_WHERE },
    select: { id: true, name: true, clientType: true },
    orderBy: { name: "asc" },
  });
  const rows: KbLinkRow[] = [];
  for (const c of clients) {
    const [kb, state, ti, tc] = await Promise.all([
      getKB(orgId, c.id),
      getValState(orgId, c.id),
      kbReviewToken(orgId, c.id, "internal"),
      kbReviewToken(orgId, c.id, "client"),
    ]);
    const sections = sectionsOf(kb);
    const si = summarize(sections, state.internal), sc = summarize(sections, state.client);
    rows.push({
      clientId: c.id, name: c.name, clientType: String(c.clientType),
      sections: sections.length, gaps: kbGaps(kb),
      internal: { url: kbReviewUrl(ti), ok: si.ok, total: si.total, complete: si.complete },
      client: { url: kbReviewUrl(tc), ok: sc.ok, changes: sc.changes, total: sc.total, complete: sc.complete, open: !!state.releasedAt, releasedBy: state.releasedBy ?? null },
    });
  }
  // Campaign clients first, then internal companies.
  return rows.sort((a, b) => (a.clientType === "CAMPAIGN" ? 0 : 1) - (b.clientType === "CAMPAIGN" ? 0 : 1) || a.name.localeCompare(b.name));
}
