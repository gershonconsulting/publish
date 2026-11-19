// Run: npx tsx --test tests/conn-report.test.mts
// v0.21.0 — weekly connections report (PUB-215).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/conn-report-model.ts";
const { connLine, connRow, sortRows, weekRange, weeklyDue, counts } = ((m as any).default ?? m) as typeof m;

const now = Date.parse("2026-11-23T14:00:00Z"); // Monday, 9:00 New York
const d = (n: number) => new Date(now + n * 86400000).toISOString();
const page = (o: Partial<any> = {}) => ({
  expiresAt: d(60), refreshToken: null, refreshExpiresAt: null, connectedAt: d(-5), lastError: null,
  author: "urn:li:organization:1", authors: [{ urn: "urn:li:organization:1", id: "1", name: "Altavia", vanity: "altavia", kind: "organization" }], ...o,
});
const x = (o: Partial<any> = {}) => ({ expiresAt: d(0.05), refreshToken: "r", connectedAt: d(-5), lastError: null, username: "altavia", ...o });
const LI = "https://www.linkedin.com/company/altavia/";

test("missing / expired / error are red", () => {
  assert.equal(connLine("linkedin", LI, {}, now).issue, "missing");
  assert.equal(connLine("linkedin", LI, {}, now).level, "red");
  assert.equal(connLine("linkedin", LI, { linkedin: page({ expiresAt: d(-1) }) }, now).issue, "expired");
  assert.equal(connLine("x", "altavia", { x: x({ lastError: "401" }) }, now).issue, "error");
});
test("connected and matching is ok; X with refresh token never expires", () => {
  assert.equal(connLine("linkedin", LI, { linkedin: page() }, now).level, "ok");
  assert.equal(connLine("x", "@Altavia", { x: x() }, now).level, "ok");
});
test("posts somewhere else = mismatch; expiring within 14 days = orange", () => {
  assert.equal(connLine("linkedin", "https://www.linkedin.com/company/other/", { linkedin: page() }, now).issue, "mismatch");
  assert.equal(connLine("x", "other", { x: x() }, now).issue, "mismatch");
  const s = connLine("linkedin", LI, { linkedin: page({ expiresAt: d(10) }) }, now);
  assert.equal(s.issue, "expiring"); assert.equal(s.level, "orange");
});
test("personal profile destination matches a person connection", () => {
  const p = page({ personal: true, author: "urn:li:person:a", authors: [{ urn: "urn:li:person:a", id: "a", name: "Alexandre", vanity: "alex", kind: "person" }] });
  assert.equal(connLine("linkedin", "https://www.linkedin.com/in/alex/", { linkedin: p }, now).level, "ok");
});
test("groups are extension-only, not a gap; no destination is orange", () => {
  assert.equal(connLine("linkedin", "https://www.linkedin.com/groups/123/", {}, now).level, "ok");
  assert.equal(connLine("x", null, {}, now).issue, "no_destination");
});
test("row level = worst line; week changes listed, inferred ones skipped; sorted worst first", () => {
  const ev = [
    { at: d(-3), net: "linkedin" as const, kind: "disconnected" as const, as: "Altavia", by: "system" },
    { at: d(-30), net: "x" as const, kind: "connected" as const, as: "@altavia" },
    { at: d(-2), net: "x" as const, kind: "connected" as const, as: "@altavia", inferred: true },
  ];
  const r = connRow({ clientId: "1", name: "B", linkedinUrl: LI, xHandle: "altavia" }, { x: x() }, ev, now - 7 * 86400000, now);
  assert.equal(r.level, "red");
  assert.equal(r.changes.length, 1);
  assert.match(r.changes[0], /LinkedIn page disconnected/);
  const ok = connRow({ clientId: "2", name: "A", linkedinUrl: LI, xHandle: "altavia" }, { linkedin: page(), x: x() }, [], 0, now);
  assert.deepEqual(sortRows([ok, r]).map((z) => z.name), ["B", "A"]);
  assert.deepEqual(counts([ok, r]), { red: 1, orange: 0, ok: 1, total: 2 });
});
test("Monday once per week (New York)", () => {
  assert.deepEqual(weeklyDue(now, null), { due: true, key: "2026-11-23" });
  assert.equal(weeklyDue(now, "2026-11-23").due, false);
  assert.equal(weeklyDue(now + 86400000, null).due, false); // Tuesday
  assert.equal(weeklyDue(Date.parse("2026-11-23T03:00:00Z"), null).due, false); // still Sunday in New York
});
test("week label = the 7 days before the send day", () => {
  assert.equal(weekRange(now).label, "Nov 16–22, 2026");
  assert.equal(weekRange(Date.parse("2026-12-02T14:00:00Z")).label, "Nov 25 – Dec 1, 2026");
});
