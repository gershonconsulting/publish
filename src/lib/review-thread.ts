/**
 * v0.16.2 — internal vs external exchanges on a post.
 * Olivier (2026-11-10): "We have internal exchanges about the post and
 * external exchanges with the client. He should not see the internal."
 *
 * External (shown on the client review page):
 *  - the client's own comment / changes_requested / approved events,
 *  - a "revised" event (new version) written in answer to a CLIENT comment.
 * Internal (never sent to the review page): team comments, revisions made from
 * a team comment, edits, previous versions, anything else.
 * "submitted" events are kept only for their batch name (page grouping) and
 * flagged so the page never lists them as messages.
 */
export type ThreadEvent = {
  id: string; authorName: string | null; authorRole: string; kind: string;
  body: string | null; version: number; createdAt: Date | string;
};

const ASKS = new Set(["comment", "changes_requested"]);

export function clientVisibleEvents<T extends ThreadEvent>(events: T[]): T[] {
  const sorted = [...events].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const out: T[] = [];
  let lastAskByClient = false;
  for (const e of sorted) {
    if (e.kind === "submitted") {
      out.push({ ...e, authorName: null, body: e.body && e.body.startsWith("batch:") ? e.body : null });
      continue;
    }
    if (ASKS.has(e.kind)) {
      lastAskByClient = e.authorRole === "client";
      if (lastAskByClient) out.push(e);
      continue;
    }
    if (e.kind === "approved" && e.authorRole === "client") { out.push(e); continue; }
    if (e.kind === "revised" && lastAskByClient) {
      out.push(e);
      lastAskByClient = false;
    }
  }
  return out;
}
