// Run: npx tsx --test tests/feature-status.test.mts
// v0.25.0 — weekly feature-status email (PUB-217).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/feature-status-model.ts";
import * as d from "../src/lib/feature-status-data.ts";
const { groupFeatures, featureCounts, featureStatusHtml, featureStatusSubject } = ((m as any).default ?? m) as typeof m;
const { FEATURES } = ((d as any).default ?? d) as typeof d;

const now = Date.parse("2026-11-30T14:00:00Z"); // Monday
const list: any[] = [
  { id: "a", title: "Started one", state: "started", since: "2026-11-01" },
  { id: "b", title: "Waiting <b>", state: "validation", since: "2026-11-28", note: "PR #1" },
  { id: "c", title: "Done this week", state: "done", since: "2026-11-27" },
  { id: "e", title: "Done long ago", state: "done", since: "2026-09-01" },
];

test("groups red, orange, green in that order; old greens folded", () => {
  const g = groupFeatures(list, now);
  assert.deepEqual(g.map((x) => x.state), ["started", "validation", "done"]);
  assert.equal(g[2].items.length, 1);
  assert.equal(g[2].olderDone, 1);
  assert.equal(g[1].items[0].isNew, true);
  assert.equal(g[0].items[0].isNew, false);
});

test("counts and subject", () => {
  assert.deepEqual(featureCounts(list, now), { started: 1, validation: 1, done: 2, doneThisWeek: 1 });
  assert.match(featureStatusSubject(list, "Nov 23–29, 2026", now), /🔴 1 started · 🟠 1 pending validation · 🟢 1 done this week/);
});

test("html escapes titles and shows notes", () => {
  const h = featureStatusHtml(list, "Nov 23–29, 2026", now);
  assert.ok(h.includes("Waiting &lt;b&gt;"));
  assert.ok(h.includes("PR #1"));
  assert.ok(h.includes("1 earlier feature done"));
});

test("data file: unique ids, valid states and dates", () => {
  const ids = new Set<string>();
  for (const f of FEATURES) {
    assert.ok(!ids.has(f.id), `duplicate id ${f.id}`); ids.add(f.id);
    assert.ok(["started", "validation", "done"].includes(f.state));
    assert.match(f.since, /^\d{4}-\d{2}-\d{2}$/);
  }
});
