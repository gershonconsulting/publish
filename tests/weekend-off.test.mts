// Run: npx tsx --test tests/weekend-off.test.mts
// v0.23.3 — "We don't publish content during week-ends for any clients."
import { test } from "node:test";
import assert from "node:assert/strict";
import * as w from "../src/lib/work-days.ts";
const { isWeekendInstant, toWorkday, etDay } = ((w as any).default ?? w) as typeof w;

test("Saturday/Sunday in New York are weekend instants", () => {
  assert.equal(isWeekendInstant(new Date("2026-11-28T15:00:00Z")), true);  // Sat 10:00 ET
  assert.equal(isWeekendInstant(new Date("2026-11-29T23:00:00Z")), true);  // Sun 18:00 ET
  assert.equal(isWeekendInstant(new Date("2026-11-30T15:00:00Z")), false); // Mon
});

test("New York clock, not UTC: Sat 02:00Z is still Friday evening in NY", () => {
  assert.equal(isWeekendInstant(new Date("2026-11-28T02:00:00Z")), false);
  assert.equal(isWeekendInstant(new Date("2026-11-30T03:00:00Z")), true);  // Sun 22:00 ET, Mon UTC
});

test("a weekend retry/schedule waits for Monday, same NY time", () => {
  const sat = new Date("2026-11-28T15:00:00Z");
  const m = toWorkday(sat);
  assert.equal(etDay(m), "2026-11-30");
  assert.equal(m.toISOString(), "2026-11-30T15:00:00.000Z");
  const wed = new Date("2026-11-25T15:00:00Z");
  assert.equal(toWorkday(wed).getTime(), wed.getTime());
});
