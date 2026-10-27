/**
 * v0.7.3 — No links in X posts (Olivier, 2026-10-27).
 *
 * The X API bills a post that contains a URL at $0.20 instead of $0.015
 * (13×). A reply is a post too, so "link in the first reply" costs
 * $0.015 + $0.20 — more, not less. The only saving is to send X posts with
 * no URL at all, so every X text we produce or publish goes through
 * stripLinks(). LinkedIn texts are never touched.
 *
 * X turns bare domains ("gershon.ai", "www.valos.com/x") into links too,
 * so those are removed as well, not only http(s):// links.
 */

const SCHEME = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
const WWW = /\bwww\.[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s<>"')\]]*)?/gi;
// Bare domain with a common TLD, optional path. Not preceded by @ (handles, emails), a word char or a dot.
const BARE = /(?<![@\w.])[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|ai|co|us|fr|de|uk|eu|app|dev|biz|info|tech|news|ly|me|tv|gl)\b(?:\/[^\s<>"')\]]*)?/gi;

const MARK = "\u0000";
// A call to action that only existed to carry the link ("Read more", "Visit ... to learn more", "👉").
const CTA = /\b(read|learn|find out|discover|see|watch|download|register|sign up|join|visit|check out|details|link|more info|apply|book|get (?:it|yours|started))\b|👉|➡️|→|⬇️|🔗/iu;
const TAGS = /(?:\s*#[\p{L}\p{N}_]+)+\s*$/u;

function cleanSentence(s: string): string {
  if (!s.includes(MARK)) return s;
  // "(recording: <link>)" → gone entirely.
  s = s.replace(new RegExp(`\\s*\\(([^()]*)${MARK}([^()]*)\\)`, "g"), (all, a: string, b: string) =>
    (a + " " + b).replace(/[^\\p{L}\\p{N}\\s]/gu, " ").trim().split(/\\s+/).filter(Boolean).length <= 3 ? "" : all);
  if (!s.includes(MARK)) return s;
  const tags = (s.match(TAGS) || [""])[0];
  const body = s.slice(0, s.length - tags.length);
  const words = body.replace(new RegExp(MARK, "g"), " ").replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  // Short sentence with a call to action → it was only there for the link: drop it, keep its hashtags.
  if (words.length <= 10 && CTA.test(body)) return tags.trim() ? " " + tags.trim() : "";
  return (body.replace(new RegExp(`\\s*${MARK}`, "g"), "").replace(/\s*[:\-–—(]\s*$/, "") + tags);
}

export function stripLinks(text: string): { text: string; removed: string[] } {
  const removed: string[] = [];
  const take = (m: string) => {
    const tail = (m.match(/[.,;:!?]+$/) || [""])[0];
    removed.push(m.slice(0, m.length - tail.length));
    return MARK + tail;
  };
  const marked = (text || "").replace(SCHEME, take).replace(WWW, take).replace(BARE, take);
  if (!removed.length) return { text, removed };
  const plain = marked.replace(new RegExp(`\\s*${MARK}`, "g"), "").replace(/[ \t]{2,}/g, " ").replace(/\s*(?:👉|➡️|→|⬇️|🔗|[:\-–—])+\s*$/u, "").trim();
  const out = marked
    .split("\n")
    .map((line) => {
      if (!line.includes(MARK)) return line;
      // Sentences keep their end punctuation; hashtags at the end of a line stay on it.
      const parts = line.match(/[^.!?]*(?:[.!?]+|$)/g)?.filter((p) => p.length) || [line];
      return parts.map(cleanSentence).join("").replace(/[ \t]{2,}/g, " ").replace(/\s+([.,;!?])/g, "$1").trim();
    })
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Never let the cleanup eat the post: if only hashtags (or nothing) are left, keep the words, drop just the links.
  const words = out.replace(TAGS, "").trim();
  return { text: words ? out : plain, removed };
}

export function hasLink(text: string): boolean {
  return stripLinks(text).removed.length > 0;
}
