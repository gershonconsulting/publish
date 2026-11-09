// Run: npx tsx --test tests/portfolio.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/portfolio.ts";
const { buildPortfolio, portfolioTotals } = ((m as any).default ?? m) as typeof m;

const client = (id: string, name = id, clientType = "CAMPAIGN") => ({ id, name, clientType });
const sum = (clientId: string, over: Partial<m.SummaryIn> = {}): m.SummaryIn => ({
  clientId, company: clientId, clientType: "CAMPAIGN", inReview: 0, published: 4, failed: 0, scheduled: 3,
  nextScheduledAt: "2026-11-10T14:00:00.000Z", nextScheduledPlatform: "LINKEDIN",
  runwayDays: 20, runwayToHorizon: false, runwayLevel: "ok", lastPublishedAt: null, timezone: "America/New_York", ...over,
});
const inv = (clientId: string, over: Partial<m.InventoryIn> = {}): m.InventoryIn => ({
  clientId, name: clientId, coverageDays: 10, drafts: 0, inReview: 0, changesRequested: 0,
  oldestReviewDays: 0, overdueReviews: 0, overdueChanges: 0, level: "ok", ...over,
});

test("a healthy company is green with no reasons", () => {
  const [r] = buildPortfolio({ clients: [client("a")], summary: [sum("a")], inventory: [inv("a")], connections: [{ clientId: "a", linkedin: "ready", x: "ready", atRisk: 0 }] });
  assert.equal(r.tone, "ok");
  assert.deepEqual(r.reasons, []);
  assert.equal(r.readyDays, 20);
});

test("no content and nothing scheduled is red, with the reasons in words", () => {
  const [r] = buildPortfolio({ clients: [client("a")], summary: [sum("a", { runwayDays: 0, runwayLevel: "critical", nextScheduledAt: null })], inventory: null, connections: null });
  assert.equal(r.tone, "bad");
  assert.deepEqual(r.reasons, ["No approved content ready", "Nothing scheduled"]);
});

test("late client approval and failures are orange", () => {
  const [r] = buildPortfolio({ clients: [client("a")], summary: [sum("a", { failed: 2 })], inventory: [inv("a", { inReview: 3, overdueReviews: 2, oldestReviewDays: 6 })], connections: null });
  assert.equal(r.tone, "warn");
  assert.ok(r.reasons.includes("2 posts did not go out this month"));
  assert.ok(r.reasons.includes("Client has not approved for 6 days"));
  assert.equal(r.waiting, 3);
  assert.equal(r.oldestWaitingDays, 6);
});

test("posts at risk on a connection make it red", () => {
  const [r] = buildPortfolio({ clients: [client("a")], summary: [sum("a")], inventory: null, connections: [{ clientId: "a", linkedin: "missing", x: "ready", atRisk: 2 }] });
  assert.equal(r.tone, "bad");
  assert.equal(r.reasons[0], "2 upcoming posts cannot go out (connection)");
});

test("unavailable feeds give null, never 0", () => {
  const [r] = buildPortfolio({ clients: [client("a")], summary: null, inventory: null, connections: null });
  assert.equal(r.readyDays, null);
  assert.equal(r.toDo, null);
  assert.equal(r.publishedThisMonth, null);
  assert.equal(r.tone, "ok");
  const t = portfolioTotals([r]);
  assert.equal(t.published, null);
  assert.equal(t.toDo, null);
});

test("worst first, then fewest days ready", () => {
  const rows = buildPortfolio({
    clients: [client("ok"), client("bad"), client("warnLow"), client("warnHigh")],
    summary: [
      sum("ok"),
      sum("bad", { nextScheduledAt: null }),
      sum("warnLow", { runwayDays: 5, runwayLevel: "low" }),
      sum("warnHigh", { runwayDays: 12, failed: 1 }),
    ],
    inventory: null,
    connections: null,
  });
  assert.deepEqual(rows.map((r) => r.clientId), ["bad", "warnLow", "warnHigh", "ok"]);
  const t = portfolioTotals(rows);
  assert.deepEqual([t.bad, t.warn, t.ok, t.clients], [1, 2, 1, 4]);
  assert.equal(t.failed, 1);
});
