// Run: npx tsx --test tests/client-subject.test.mts
// v0.16.1 — client validation email subject (Olivier, 2026-11-10).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/publishing-mail.ts";
const { clientSubject, numberedSubject } = ((m as any).default ?? m) as typeof m;

test("Altavia example from Olivier", () => {
  assert.equal(clientSubject("Altavia", "Alexandre Rouleau", new Date("2026-11-16T14:00:00Z")), "Gershon Consulting Publish - Altavia (Alexandre) - November 2026");
});
test("month is the posting month in New York, not UTC", () => {
  assert.equal(clientSubject("WALLIX", null, new Date("2026-12-01T03:00:00Z")), "Gershon Consulting Publish - WALLIX - November 2026");
});
test("ready-made month label (Autopilot)", () => {
  assert.equal(clientSubject("Linalysis", "", "December 2026"), "Gershon Consulting Publish - Linalysis - December 2026");
});
test("no company name falls back, never empty", () => {
  assert.match(clientSubject(null, null, new Date("2026-11-10T12:00:00Z")), /^Gershon Consulting Publish - Your content - November 2026$/);
});
test("internal emails keep their number", () => {
  assert.equal(numberedSubject("INVENTORY", "Content inventory"), "[PUB-201] Content inventory");
});
