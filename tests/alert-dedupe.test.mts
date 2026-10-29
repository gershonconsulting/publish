// Run: npx tsx --test tests/alert-dedupe.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/alert-dedupe.ts";
const a = ((m as any).default ?? m) as typeof m;

function mem(): m.AlertStore & { m: Map<string, string> } {
  const map = new Map<string, string>();
  return { m: map, get: async (k) => map.get(k) ?? null, set: async (k, v) => void map.set(k, v) };
}
const DAY = 86400000, T0 = Date.UTC(2026, 9, 23, 12);
// Same four posts every day; reschedule gives them NEW delivery ids but the same content/time.
const day = (n: number) => ["a", "b", "c", "d"].map((c) => ({ id: `d${n}-${c}`, contentId: c, platform: "TWITTER", target: null, scheduledAtMs: T0 - 3600000 }));
async function sweep(store: m.AlertStore, posts: m.FailedPost[], now: number) {
  const fresh = await a.newFailures(store, posts, now);
  if (fresh.length) await a.markAlerted(store, fresh, now); // = one grouped email
  return fresh;
}

test("3 consecutive days with the same failures -> 1 email", async () => {
  const s = mem(); let emails = 0;
  for (let n = 0; n < 3; n++) if ((await sweep(s, day(n), T0 + n * DAY)).length) emails++;
  assert.equal(emails, 1);
});

test("first email lists all four at once; a new failure -> 1 email with only the new one", async () => {
  const s = mem();
  assert.equal((await sweep(s, day(0), T0)).length, 4);
  assert.equal((await sweep(s, day(1), T0 + DAY)).length, 0);
  const extra = { id: "x", contentId: "e", platform: "LINKEDIN", target: "page", scheduledAtMs: T0 + DAY };
  const fresh = await sweep(s, [...day(2), extra], T0 + 2 * DAY);
  assert.deepEqual(fresh.map((p) => p.contentId), ["e"]);
});

test("re-alert after a Retry that fails again (new scheduled time)", async () => {
  const s = mem();
  await sweep(s, day(0), T0);
  const retried = day(1).map((p) => ({ ...p, scheduledAtMs: T0 + DAY }));
  assert.equal((await sweep(s, retried, T0 + DAY + 3600000)).length, 4);
});

test("re-alert after 7 days", async () => {
  const s = mem();
  await sweep(s, day(0), T0);
  assert.equal((await sweep(s, day(6), T0 + 6 * DAY)).length, 0);
  assert.equal((await sweep(s, day(8), T0 + 8 * DAY)).length, 4);
});

test("a failed send is not recorded, so it is retried next sweep", async () => {
  const s = mem();
  assert.equal((await a.newFailures(s, day(0), T0)).length, 4); // email failed: markAlerted not called
  assert.equal((await a.newFailures(s, day(0), T0 + 900000)).length, 4);
});

test("under half a week: full only when the set changed", async () => {
  const s = mem();
  const ids = ["c1", "c2", "c3"];
  assert.equal(await a.criticalUnchanged(s, "team", ids), false); // first email
  await a.saveCritical(s, "team", ids);
  assert.equal(await a.criticalUnchanged(s, "team", [...ids].reverse()), true); // next day, same set
  assert.equal(await a.criticalUnchanged(s, "team", ["c1", "c2"]), false); // count changed
  assert.equal(await a.criticalUnchanged(s, "team", ["c1", "c2", "c9"]), false); // same count, other company
  assert.equal(await a.criticalUnchanged(s, "ops", ids), false); // separate scope
  assert.equal(a.noChangeLine(8), "No change since yesterday (8 companies under half a week)");
});
