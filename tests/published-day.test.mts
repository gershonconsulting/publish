// Run: npx tsx --test tests/published-day.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/published-day-model.ts";
const { groupDay, shiftDay, firstPicture, ISO_DAY } = ((m as any).default ?? m) as typeof m;

const from = new Date("2026-11-04T05:00:00Z"); // 00:00 ET (EST)
const to = new Date("2026-11-05T05:00:00Z");
const cos = [
  { id: "a", name: "Acme", clientType: "CAMPAIGN", timezone: "America/New_York" },
  { id: "b", name: "Beta", clientType: "INTERNAL", timezone: "Europe/Paris" },
  { id: "c", name: "Calm", clientType: "INTERNAL", timezone: "America/New_York" },
];
const d = (o: Partial<m.DayDelivery>): m.DayDelivery => ({
  id: Math.random().toString(36), clientId: "a", contentId: null, platform: "LINKEDIN", target: null, text: "t",
  status: "POSTED", scheduledAt: "2026-11-04T14:00:00Z", postedAt: "2026-11-04T14:01:00Z", postUrl: null,
  verifiedAt: null, lastError: null, picture: null, ...o,
});

test("groups by company, splits published / not out / pending, drops empty companies", () => {
  const rows = [
    d({ clientId: "a", platform: "TWITTER", postedAt: "2026-11-04T16:00:00Z", verifiedAt: "2026-11-04T18:00:00Z" }),
    d({ clientId: "a", postedAt: "2026-11-04T13:00:00Z" }),
    d({ clientId: "a", postedAt: "2026-11-05T06:00:00Z" }), // next day ET → out
    d({ clientId: "b", status: "MISSED", postedAt: null }),
    d({ clientId: "b", status: "SCHEDULED", postedAt: null, scheduledAt: "2026-11-04T22:00:00Z" }),
  ];
  const g = groupDay(cos, rows, from, to);
  assert.deepEqual(g.companies.map((c) => c.company), ["Acme", "Beta"]);
  assert.equal(g.companies[0].published.length, 2);
  assert.equal(g.companies[0].published[0].postedAt, "2026-11-04T13:00:00Z"); // time order
  assert.equal(g.companies[1].notOut.length, 1);
  assert.equal(g.companies[1].pending.length, 1);
  assert.deepEqual(g.totals, { published: 2, companies: 1, linkedin: 1, x: 1, verified: 1, notOut: 1, pending: 1 });
});

test("companies with posts come before companies with only misses", () => {
  const g = groupDay(cos, [d({ clientId: "a", status: "FAILED", postedAt: null }), d({ clientId: "c" })], from, to);
  assert.deepEqual(g.companies.map((c) => c.company), ["Calm", "Acme"]);
});

test("helpers", () => {
  assert.equal(shiftDay("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftDay("2026-12-31", 1), "2027-01-01");
  assert.equal(firstPicture('[{"url":"/api/media/x?k=1"}]'), "/api/media/x?k=1");
  assert.equal(firstPicture("bad"), null);
  assert.equal(firstPicture(null), null);
  assert.ok(ISO_DAY.test("2026-11-04"));
  assert.ok(!ISO_DAY.test("2026-13-04"));
});
