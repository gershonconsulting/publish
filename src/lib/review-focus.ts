/**
 * v0.25.1 — the review link opens on the posts the email was about.
 *
 * Olivier, 2026-11-24 (Amphasys PUB-102 "December 2026", 12 posts): "Les posts
 * affichés lorsqu'on clique sur le bouton ne correspondent pas aux posts
 * sélectionnés pour review". The page listed all 60 posts of the company and put
 * the old "Amphasys — October 2026" batch (26 posts) first, and "Approve all"
 * approved every waiting post of the company, not the 12 that were sent.
 *
 * Now every review email links to /review/<token>?batch=<name> (batch emails) or
 * ?post=<id> (one post). The page shows only those posts; everything else of the
 * company is behind "Show the other posts". "Approve all" approves only them.
 * Pure (no DB) so it is tested in tests/review-focus.test.mts.
 */

export type FocusEvent = { kind: string; body: string | null; createdAt: string | Date };
export type FocusItem = { id: string; status: string; comments: FocusEvent[] };
export type Focus = { batch?: string | null; post?: string | null };

/** Review link with the focus in the query string (base = reviewUrl(token)). */
export function focusedReviewUrl(base: string, focus: Focus): string {
  const q = new URLSearchParams();
  const batch = (focus.batch || "").trim();
  const post = (focus.post || "").trim();
  if (post) q.set("post", post);
  else if (batch) q.set("batch", batch.slice(0, 160));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/** Read the focus back from a page's query string. */
export function readFocus(search: string | URLSearchParams | null | undefined): Focus {
  const q = typeof search === "string" ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search) : search ?? new URLSearchParams();
  const post = (q.get("post") || "").trim();
  const batch = (q.get("batch") || "").trim();
  return { post: post || null, batch: post ? null : batch || null };
}

/** The batch a post was last sent in: the latest "submitted" event's "batch:<name>". */
export function latestBatch(comments: FocusEvent[]): string | null {
  let best: FocusEvent | null = null;
  for (const c of comments) {
    if (c.kind !== "submitted" || !(c.body || "").startsWith("batch:")) continue;
    if (!best || new Date(c.createdAt).getTime() >= new Date(best.createdAt).getTime()) best = c;
  }
  return best ? (best.body as string).slice(6).trim() : null;
}

/** Normalised batch name: spaces collapsed ("Amphasys  — December" = "Amphasys — December"). */
function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Split the company's posts into the ones the link is about and the rest. */
export function splitFocus<T extends FocusItem>(items: T[], focus: Focus): { focus: T[]; rest: T[]; active: boolean } {
  const post = focus.post || null;
  const batch = focus.batch ? norm(focus.batch) : null;
  if (!post && !batch) return { focus: items, rest: [], active: false };
  const inFocus = (i: T) => (post ? i.id === post : norm(latestBatch(i.comments) || "") === batch);
  const f = items.filter(inFocus);
  // A link whose posts are all gone (deleted, re-sent in another batch): show everything.
  if (!f.length) return { focus: items, rest: [], active: false };
  return { focus: f, rest: items.filter((i) => !inFocus(i)), active: true };
}

/** Ids "Approve all" may approve: the waiting posts in view. */
export function approvableIds<T extends FocusItem>(items: T[]): string[] {
  return items.filter((i) => i.status === "IN_REVIEW").map((i) => i.id);
}

/** Newest "submitted" time of a group — the most recently sent batch is shown first. */
export function lastSubmitted(items: FocusItem[]): number {
  let t = 0;
  for (const i of items) for (const c of i.comments) if (c.kind === "submitted") t = Math.max(t, new Date(c.createdAt).getTime() || 0);
  return t;
}

/**
 * v0.28.0 — what the review link shows (Olivier 2026-11-25, Altavia): "uniquement les posts
 * sélectionnés qui soient réellement envoyés … Actuellement ça affiche même les posts déjà
 * diffusés du mois précédent."
 * - Link from an email (batch / post): exactly those posts, nothing else of the company.
 * - Bare link: the posts waiting for the client, plus the already-approved posts of the
 *   same batches (so "3 of 5 approved" stays true).
 * - Never a post that already went out (PUBLISHED / PARTIAL).
 */
const WAITING = new Set(["IN_REVIEW", "CHANGES_REQUESTED"]);
const OUT = new Set(["PUBLISHED", "PARTIAL"]);
export function reviewScope<T extends FocusItem>(items: T[], focus: Focus): T[] {
  const live = items.filter((i) => !OUT.has(i.status));
  const s = splitFocus(live, focus);
  if (s.active) return s.focus;
  const openBatches = new Set(live.filter((i) => WAITING.has(i.status)).map((i) => norm(latestBatch(i.comments) || "")).filter(Boolean));
  return live.filter((i) => WAITING.has(i.status) || openBatches.has(norm(latestBatch(i.comments) || "")));
}
