// Run: npx tsx --test tests/review-focus.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/review-focus.ts";
const { focusedReviewUrl, readFocus, latestBatch, splitFocus, approvableIds, lastSubmitted } = ((m as any).default ?? m) as typeof m;

const sub = (batch: string, day: number) => ({ kind: "submitted", body: `batch:${batch}`, createdAt: new Date(Date.UTC(2026, 10, day)).toISOString() });
const item = (id: string, status: string, ...comments: ReturnType<typeof sub>[]) => ({ id, status, comments });

// Amphasys 2026-11-24: an old October batch still waiting + the December batch just sent + history.
const october = Array.from({ length: 26 }, (_, k) => item(`oct${k}`, "IN_REVIEW", sub("Amphasys  — October 2026", 1)));
const december = Array.from({ length: 12 }, (_, k) => item(`dec${k}`, "IN_REVIEW", sub("Amphasys  — December 2026", 24)));
const history = Array.from({ length: 22 }, (_, k) => item(`h${k}`, k % 2 ? "PUBLISHED" : "APPROVED"));
const all = [...october, ...december, ...history];

test("link carries the batch and reads back the same", () => {
  const url = focusedReviewUrl("https://publish.gershon.ai/review/abc", { batch: "Amphasys  — December 2026" });
  assert.match(url, /^https:\/\/publish\.gershon\.ai\/review\/abc\?batch=/);
  assert.equal(readFocus(new URL(url).search).batch, "Amphasys  — December 2026");
  assert.equal(focusedReviewUrl("https://x/review/abc", {}), "https://x/review/abc");
  assert.deepEqual(readFocus(new URL(focusedReviewUrl("https://x/r/a", { post: "p1", batch: "B" })).search), { post: "p1", batch: null });
});

test("Amphasys: the December link shows exactly the 12 December posts", () => {
  const s = splitFocus(all, { batch: "Amphasys — December 2026" }); // spaces differ: still matches
  assert.equal(s.active, true);
  assert.deepEqual(s.focus.map((i) => i.id), december.map((i) => i.id));
  assert.equal(s.rest.length, 48);
  assert.equal(approvableIds(s.focus).length, 12, "Approve all must not touch the 26 October posts");
});

test("one-post link shows that post only", () => {
  const s = splitFocus(all, { post: "dec3" });
  assert.deepEqual(s.focus.map((i) => i.id), ["dec3"]);
});

test("no focus / unknown batch → everything (never an empty page)", () => {
  assert.equal(splitFocus(all, {}).focus.length, 60);
  const s = splitFocus(all, { batch: "Gone — May 2026" });
  assert.equal(s.active, false);
  assert.equal(s.focus.length, 60);
});

test("latest submitted batch wins when a post was re-sent", () => {
  assert.equal(latestBatch([sub("A — Oct", 1), sub("A — Dec", 20)]), "A — Dec");
  assert.equal(latestBatch([{ kind: "comment", body: "batch:x", createdAt: new Date().toISOString() }]), null);
});

test("most recently sent batch sorts first", () => {
  assert.ok(lastSubmitted(december) > lastSubmitted(october));
});

import * as d from "../src/lib/mail-dedupe.ts";
const { withoutPostFocus } = ((d as any).default ?? d) as typeof d;
test("grouped PUB-101s drop the one-post focus", () => {
  assert.equal(withoutPostFocus("https://p/review/abc?post=x1"), "https://p/review/abc");
  assert.equal(withoutPostFocus("https://p/review/abc?post=x1&b=2"), "https://p/review/abc?b=2");
  assert.equal(withoutPostFocus("https://p/review/abc?batch=A"), "https://p/review/abc?batch=A");
});
