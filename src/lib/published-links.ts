/**
 * v0.19.0 — the link to open a published post on the network (Olivier
 * 2026-11-17: "I should be able to see and click on the links to access the
 * pages where the content is published").
 *
 * Pure (no DB) so it is unit-tested. Order of preference:
 *   1. the post URL recorded when it went out;
 *   2. X only: the status id → x.com/i/status/<id> (always resolves);
 *   3. the page / profile it was posted on (kind "page"), so there is
 *      always somewhere to click when the post URL was not recorded.
 */
export type LiveLink = { href: string; kind: "post" | "page" };

function safeHttp(u: string | null | undefined): string | null {
  const s = (u || "").trim();
  if (!s) return null;
  try {
    const url = new URL(s.startsWith("http") ? s : `https://${s}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function liveLink(p: { platform: string; postUrl?: string | null; externalPostId?: string | null; target?: string | null }): LiveLink | null {
  const direct = safeHttp(p.postUrl);
  if (direct) return { href: direct, kind: "post" };
  const isX = p.platform === "TWITTER" || p.platform === "X";
  const id = (p.externalPostId || "").trim();
  if (isX && /^\d+$/.test(id)) return { href: `https://x.com/i/status/${id}`, kind: "post" };
  const t = (p.target || "").trim().replace(/^@/, "");
  if (!t) return null;
  if (isX && /^[A-Za-z0-9_]{1,15}$/.test(t)) return { href: `https://x.com/${t}`, kind: "page" };
  const page = safeHttp(t);
  return page ? { href: page, kind: "page" } : null;
}

/** First line of a post, trimmed for a list. */
export function snippet(text: string | null | undefined, max = 110): string {
  const line = (text || "").split("\n").map((l) => l.trim()).find(Boolean) || "";
  return line.length > max ? line.slice(0, max - 1).trimEnd() + "…" : line;
}
