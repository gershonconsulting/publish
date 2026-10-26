// Run: npx tsx --test tests/publish-runway.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/publish-runway.ts";
const r = ((m as any).default ?? m) as typeof m;
const { computeRunway, slotWeekdays, monthEnds, addDays, weekday, dayLabel } = r;

// 2026-10-26 is a Monday.
const TODAY = "2026-10-26";

test("date helpers", () => {
  assert.equal(weekday(TODAY), 1);
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.deepEqual(monthEnds(TODAY), { endThis: "2026-10-31", endNext: "2026-11-30" });
  assert.deepEqual(monthEnds("2026-12-05"), { endThis: "2026-12-31", endNext: "2027-01-31" });
  assert.deepEqual(slotWeekdays(5), [1, 2, 3, 4, 5]);
  assert.deepEqual(slotWeekdays(3), [1, 3, 5]);
  assert.equal(dayLabel("2026-10-28", TODAY), "Wednesday");
});

test("nothing approved: gap tomorrow, all slots missing", () => {
  const x = computeRunway({ today: TODAY, perWeek: 5, scheduledDates: [], approvedDates: [], approvedPool: 0 });
  // Tue 27 – Fri 30 = 4 weekdays left in October; November 2026 has 21 weekdays.
  assert.equal(x.thisMonth.required, 4);
  assert.equal(x.nextMonth.required, 21);
  assert.equal(x.firstGap, "2026-10-27");
  assert.equal(x.daysCovered, 0);
  assert.equal(x.neededIn7, 5); // Tue–Fri + Mon Nov 2
  assert.equal(x.level, "critical");
});

test("scheduled first, approved fill the next gaps, one item = one slot", () => {
  const x = computeRunway({ today: TODAY, perWeek: 5, scheduledDates: ["2026-10-27", "2026-10-28"], approvedDates: [], approvedPool: 2 });
  assert.equal(x.thisMonth.scheduled, 2);
  assert.equal(x.thisMonth.approved, 2);
  assert.equal(x.thisMonth.missing, 0);
  assert.equal(x.firstGap, "2026-11-02");
  assert.equal(x.daysCovered, 6);
  assert.equal(x.neededIn7, 1);
  assert.equal(x.surplus, 0);
});

test("two posts on the same day cover two slots of that week, not one twice", () => {
  const x = computeRunway({ today: TODAY, perWeek: 5, scheduledDates: ["2026-10-29", "2026-10-29"], approvedDates: [], approvedPool: 0 });
  assert.equal(x.thisMonth.scheduled, 2);
  assert.equal(x.firstGap, "2026-10-27");
});

test("3 per week only needs Mon/Wed/Fri", () => {
  const x = computeRunway({ today: TODAY, perWeek: 3, scheduledDates: [], approvedDates: [], approvedPool: 2 });
  assert.equal(x.thisMonth.required, 2); // Wed 28, Fri 30
  assert.equal(x.thisMonth.missing, 0);
  assert.equal(x.firstGap, "2026-11-02");
});

test("more approved content than slots is surplus, covered to horizon", () => {
  const x = computeRunway({ today: TODAY, perWeek: 1, scheduledDates: [], approvedDates: [], approvedPool: 10 });
  assert.equal(x.coveredToHorizon, true);
  assert.equal(x.firstGap, null);
  assert.ok(x.surplus > 0);
  assert.equal(x.level, "ok");
});
