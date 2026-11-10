/**
 * Knowledge validation — pure logic (v0.16.0, Olivier 2026-11-10).
 *
 * "We need the client to validate everything we have" — two levels:
 *   1. INTERNAL: the Gershon team member running the campaign checks every
 *      section of the company's Knowledge Base (private link, no account);
 *   2. CLIENT: only once every section passed the internal check, the client
 *      gets its own private link to confirm or correct each section.
 *
 * A verdict is tied to the text it was given on (fingerprint): when the
 * section is edited afterwards, it goes back to "to check" at that level.
 * No database access here, so it can be tested on its own.
 */

export type Level = "internal" | "client";
export type VerdictStatus = "ok" | "changes";
export type Verdict = { status: VerdictStatus; comment: string; name: string | null; at: string; fp: string };
export type ValState = {
  internal: Record<string, Verdict>;
  client: Record<string, Verdict>;
  /** When every section first passed the internal check: the client link opens from then on. */
  releasedAt: string | null;
};
export type SectionKind = "valueProp" | "competitive" | "icp" | "style";
export type KBSection = { id: string; kind: SectionKind; title: string; text: string; source: "ai" | "manual"; updatedAt: string | null };
export type SectionStatus = "pending" | VerdictStatus;

type KBLike = {
  valueProp: { text: string; source: "ai" | "manual"; updatedAt: string | null };
  competitive: { notes: string; source: "ai" | "manual"; updatedAt: string | null };
  icps: Array<{ id: string; name: string; description: string; source: "ai" | "manual"; updatedAt: string }>;
  style: { text: string; source: "ai" | "manual"; updatedAt: string | null };
};

export const EMPTY_STATE: ValState = { internal: {}, client: {}, releasedAt: null };

/** The sections a reviewer validates, in reading order. House style only when written. */
export function sectionsOf(kb: KBLike): KBSection[] {
  const out: KBSection[] = [
    { id: "valueProp", kind: "valueProp", title: "Value proposition", text: kb.valueProp.text || "", source: kb.valueProp.source, updatedAt: kb.valueProp.updatedAt },
    { id: "competitive", kind: "competitive", title: "Competitive landscape", text: kb.competitive.notes || "", source: kb.competitive.source, updatedAt: kb.competitive.updatedAt },
  ];
  for (const i of kb.icps) {
    if (!i?.id) continue;
    out.push({ id: `icp:${i.id}`, kind: "icp", title: `Ideal customer: ${i.name}`, text: i.description || "", source: i.source, updatedAt: i.updatedAt || null });
  }
  if ((kb.style.text || "").trim()) {
    out.push({ id: "style", kind: "style", title: "Writing style", text: kb.style.text, source: kb.style.source, updatedAt: kb.style.updatedAt });
  }
  return out;
}

/** Short, stable fingerprint of a section's text (whitespace-insensitive at the ends). */
export function fingerprint(text: string): string {
  const s = (text || "").replace(/\r\n/g, "\n").trim();
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = (Math.imul(h1, 33) ^ c) >>> 0;
    h2 = (Math.imul(h2, 31) + c) >>> 0;
  }
  return `${s.length.toString(36)}-${h1.toString(36)}${h2.toString(36)}`;
}

/** The verdict that still applies to this section's current text, if any. */
export function currentVerdict(section: KBSection, v: Verdict | undefined): Verdict | null {
  return v && v.fp === fingerprint(section.text) ? v : null;
}

export function statusOf(section: KBSection, v: Verdict | undefined): SectionStatus {
  return currentVerdict(section, v)?.status ?? "pending";
}

export type Summary = { total: number; ok: number; changes: number; pending: number; complete: boolean };
export function summarize(sections: KBSection[], verdicts: Record<string, Verdict>): Summary {
  let ok = 0, changes = 0, pending = 0;
  for (const s of sections) {
    const st = statusOf(s, verdicts[s.id]);
    if (st === "ok") ok++;
    else if (st === "changes") changes++;
    else pending++;
  }
  return { total: sections.length, ok, changes, pending, complete: sections.length > 0 && ok === sections.length };
}

/** Sanitize a state read from storage. */
export function parseState(raw: string | null | undefined): ValState {
  if (!raw) return structuredClone(EMPTY_STATE);
  try {
    const v = JSON.parse(raw) as Partial<ValState>;
    const clean = (m: unknown): Record<string, Verdict> => {
      const out: Record<string, Verdict> = {};
      if (!m || typeof m !== "object") return out;
      for (const [k, x] of Object.entries(m as Record<string, Partial<Verdict>>)) {
        if (!x || (x.status !== "ok" && x.status !== "changes") || typeof x.fp !== "string") continue;
        out[k] = { status: x.status, comment: String(x.comment || ""), name: x.name ? String(x.name) : null, at: String(x.at || ""), fp: x.fp };
      }
      return out;
    };
    return { internal: clean(v.internal), client: clean(v.client), releasedAt: typeof v.releasedAt === "string" ? v.releasedAt : null };
  } catch {
    return structuredClone(EMPTY_STATE);
  }
}

export type VerdictInput = { section: string; status: VerdictStatus; comment?: string | null; name?: string | null };

/**
 * Record one verdict at one level. Returns the new state, or an error message.
 * "Needs changes" needs a comment; the client level is closed until released.
 */
export function applyVerdict(
  state: ValState,
  sections: KBSection[],
  level: Level,
  input: VerdictInput,
  now: Date = new Date(),
): { state: ValState; completedNow: boolean } | { error: string } {
  const section = sections.find((s) => s.id === input.section);
  if (!section) return { error: "This section does not exist any more. Reload the page." };
  if (input.status !== "ok" && input.status !== "changes") return { error: "Bad request" };
  const comment = String(input.comment || "").trim().slice(0, 4000);
  if (input.status === "changes" && !comment) return { error: "Tell us what to change." };
  if (level === "client" && !state.releasedAt) return { error: "This review is not open yet." };
  const before = summarize(sections, state[level]).complete;
  const next: ValState = structuredClone(state);
  next[level][section.id] = {
    status: input.status,
    comment,
    name: (input.name || "").trim().slice(0, 80) || null,
    at: now.toISOString(),
    fp: fingerprint(section.text),
  };
  const after = summarize(sections, next[level]).complete;
  if (level === "internal" && after && !next.releasedAt) next.releasedAt = now.toISOString();
  return { state: next, completedNow: !before && after };
}

/** Token formats: ki_ (internal) / kc_ (client) + 36 hex. */
export function levelOfToken(token: string): Level | null {
  if (/^ki_[a-f0-9]{36}$/.test(token)) return "internal";
  if (/^kc_[a-f0-9]{36}$/.test(token)) return "client";
  return null;
}
