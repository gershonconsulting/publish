// Run: npx tsx --test tests/skip-days.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/skip-days-model.ts";
const { addSkipDays, parseSkipDays, removeSkipDays, skipKey } = ((m as any).default ?? m) as typeof m;

test("Altavia: a deleted holiday post keeps its day empty", () => {
  const days = addSkipDays([], ["2026-12-25"], "2026-11-25");
  assert.deepEqual(days, ["2026-12-25"]);
  assert.deepEqual(addSkipDays(days, ["2026-12-25", "2026-11-27"], "2026-11-25"), ["2026-11-27", "2026-12-25"], "deduped and sorted");
});
test("old days are dropped, bad values ignored", () => {
  assert.deepEqual(addSkipDays(["2026-01-02", "junk"], ["2026-11-20"], "2026-11-25"), ["2026-11-20"]);
  assert.deepEqual(parseSkipDays('["2026-12-25", 3, "x"]'), ["2026-12-25"]);
  assert.deepEqual(parseSkipDays("not json"), []);
  assert.deepEqual(parseSkipDays(null), []);
});
test("release + key", () => {
  assert.deepEqual(removeSkipDays(["2026-12-24", "2026-12-25"], ["2026-12-24"]), ["2026-12-25"]);
  assert.equal(skipKey("c1"), "skip_days:c1");
});
