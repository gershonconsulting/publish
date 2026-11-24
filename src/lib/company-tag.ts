/**
 * v0.22.0 (Olivier, 2026-11-19): "@company for all posts — the company should
 * be tagged on all posts created for them." Pure text logic, no database.
 *
 * - The post text carries a plain "@Company Name" (LinkedIn) / "@handle" (X),
 *   so the reviewer sees the tag before approving.
 * - When the post goes out through the LinkedIn API, "@Company Name" becomes a
 *   real mention (`@[Company Name](urn:li:organization:N)`) — needs the page's
 *   organization id. Through the publishing browser it stays plain text.
 * - A company is never tagged on its own page / its own X account.
 */

export type CompanyTag = {
  /** The name exactly as on the LinkedIn page (LinkedIn matches it). */
  name: string | null;
  /** urn:li:organization:N, or null when not known yet. */
  linkedinUrn: string | null;
  /** X handle without "@". */
  xHandle: string | null;
};

/** "urn:li:organization:123", "123" or "linkedin.com/company/123/…" → urn; anything else → null. */
export function parseLinkedInOrg(v: string | null | undefined): string | null {
  const s = String(v || "").trim();
  if (!s) return null;
  let m = s.match(/^urn:li:(?:organization|company):(\d+)$/i);
  if (m) return `urn:li:organization:${m[1]}`;
  m = s.match(/^(\d{3,})$/);
  if (m) return `urn:li:organization:${m[1]}`;
  m = s.match(/linkedin\.com\/company\/(\d{3,})(?:[/?#]|$)/i);
  if (m) return `urn:li:organization:${m[1]}`;
  return null;
}

const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "@Name" not followed by a letter/digit (so "@Altavia" ≠ "@AltaviaGroup"). */
function tagRe(name: string, flags = "i"): RegExp {
  return new RegExp(`@${reEsc(name)}(?![\\p{L}\\p{N}_])`, flags + "u");
}

export function hasTag(text: string, name: string): boolean {
  return tagRe(name).test(text);
}

const HASHTAGS_ONLY = /^(\s*#[\p{L}\p{N}_]+)+\s*$/u;

/** LinkedIn: "@Name" on its own line, just above the closing hashtags (or at the end). */
export function withLinkedInTag(text: string, name: string | null, max: number): string {
  const n = (name || "").trim();
  if (!n || hasTag(text, n)) return text;
  const body = text.replace(/\s+$/, "");
  const paras = body.split(/\n{2,}/);
  let out: string;
  if (paras.length > 1 && HASHTAGS_ONLY.test(paras[paras.length - 1])) {
    out = [...paras.slice(0, -1), `@${n}`, paras[paras.length - 1]].join("\n\n");
  } else {
    out = `${body}\n\n@${n}`;
  }
  return Array.from(out).length <= max ? out : text;
}

/** X: " @handle" before the closing hashtags; the text is shortened if needed to fit. */
export function withXTag(
  text: string,
  handle: string | null,
  max: number,
  len: (s: string) => number = (s) => Array.from(s).length,
  fit: (s: string, max: number) => string = (s, m) => Array.from(s).slice(0, m).join(""),
): string {
  const h = (handle || "").replace(/^@/, "").trim();
  if (!h || hasTag(text, h)) return text;
  const add = (t: string) => {
    const m = t.match(/((?:\s+#[\p{L}\p{N}_]+)+)\s*$/u);
    return m ? `${t.slice(0, m.index).replace(/\s+$/, "")} @${h}${m[1]}` : `${t.replace(/\s+$/, "")} @${h}`;
  };
  const out = add(text);
  if (len(out) <= max) return out;
  return add(fit(text, Math.max(20, max - h.length - 2)));
}

/** LinkedIn "little text": reserved characters are escaped; "@Name" for each mention becomes a real mention. */
export function liCommentary(text: string, mentions: { name: string; urn: string }[] = []): string {
  const esc = (s: string) => s.replace(/[\\|{}@\[\]()<>#*_~]/g, (m) => "\\" + m);
  const plain = (s: string) =>
    s
      .split(/(#[\p{L}\p{N}_]+)/u)
      .map((part) => (/^#[\p{L}\p{N}_]+$/u.test(part) ? `{hashtag|\\#|${esc(part.slice(1))}}` : esc(part)))
      .join("");
  const ms = mentions.filter((m) => m.name.trim() && /^urn:li:(organization|person):\d+|^urn:li:person:[\w-]+$/.test(m.urn));
  if (!ms.length) return plain(text);
  const re = new RegExp(ms.map((m) => `@${reEsc(m.name.trim())}(?![\\p{L}\\p{N}_])`).join("|"), "giu");
  let out = "";
  let last = 0;
  for (const hit of text.matchAll(re)) {
    const i = hit.index ?? 0;
    const m = ms.find((x) => x.name.trim().toLowerCase() === hit[0].slice(1).toLowerCase())!;
    // LinkedIn needs the exact page name inside the mention.
    out += plain(text.slice(last, i)) + `@[${esc(m.name.trim())}](${m.urn})`;
    last = i + hit[0].length;
  }
  return out + plain(text.slice(last));
}

/**
 * v0.24.0 — real tag through the publishing browser. The post text cut into
 * plain pieces and "@Name" mentions, so the extension pastes the plain pieces
 * and TYPES each mention ("@" + name), then picks the company from LinkedIn's
 * suggestion list. Joining every piece back ("@" before a mention) gives the
 * original text exactly.
 */
export type LiSegment = { text: string } | { mention: string };

export function liSegments(text: string, names: (string | null | undefined)[]): LiSegment[] {
  const ns = Array.from(new Set(names.map((n) => (n || "").trim()).filter(Boolean)));
  if (!ns.length || !text) return text ? [{ text }] : [];
  // Longest first, so "@Altavia North America" wins over "@Altavia".
  ns.sort((a, b) => b.length - a.length);
  const re = new RegExp(ns.map((n) => `@${reEsc(n)}(?![\\p{L}\\p{N}_])`).join("|"), "giu");
  const out: LiSegment[] = [];
  let last = 0;
  for (const hit of text.matchAll(re)) {
    const i = hit.index ?? 0;
    if (i > last) out.push({ text: text.slice(last, i) });
    // Typed as written in the post (LinkedIn's search is not case-sensitive).
    out.push({ mention: hit[0].slice(1) });
    last = i + hit[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
