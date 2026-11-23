// Run: npx tsx --test tests/client-subject.test.mts
// v0.16.1 — client validation email subject (Olivier, 2026-11-10).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/publishing-mail.ts";
const { clientSubject, numberedSubject } = ((m as any).default ?? m) as typeof m;

test("Altavia example from Olivier", () => {
  assert.equal(clientSubject("Altavia", "Alexandre Rouleau", new Date("2026-11-16T14:00:00Z")), "Publish by Gershon.AI - Altavia (Alexandre) - November 2026");
});
test("month is the posting month in New York, not UTC", () => {
  assert.equal(clientSubject("WALLIX", null, new Date("2026-12-01T03:00:00Z")), "Publish by Gershon.AI - WALLIX - November 2026");
});
test("ready-made month label (Autopilot)", () => {
  assert.equal(clientSubject("Linalysis", "", "December 2026"), "Publish by Gershon.AI - Linalysis - December 2026");
});
test("no company name falls back, never empty", () => {
  assert.match(clientSubject(null, null, new Date("2026-11-10T12:00:00Z")), /^Publish by Gershon.AI - Your content - November 2026$/);
});
test("internal emails keep their number", () => {
  assert.equal(numberedSubject("INVENTORY", "Content inventory"), "[PUB-201] Content inventory");
});

// v0.23.2 — Olivier 2026-11-23: new subject prefix + the posts' text in the email.
const { postsDigestHtml } = ((m as any).default ?? m) as typeof m;
test("Olivier's new subject (2026-11-23)", () => {
  assert.equal(clientSubject("Altavia", "Alexandre Rouleau", "December 2026"), "Publish by Gershon.AI - Altavia (Alexandre) - December 2026");
});
test("PUB-102 body shows each post's full text and its day, not just the title", () => {
  const html = postsDigestHtml([
    { title: "10-12", text: "Retail media is moving in-store.\nHere is why <it> matters & what to do.", scheduledAt: new Date("2026-12-10T14:00:00Z") },
    { title: "11-12", text: "Second post", scheduledAt: new Date("2026-12-11T14:00:00Z") },
  ]);
  assert.match(html, /Retail media is moving in-store\.\nHere is why &lt;it&gt; matters &amp; what to do\./);
  assert.match(html, /1\. Thursday, December 10/);
  assert.match(html, /2\. Friday, December 11/);
  assert.match(html, /Second post/);
});
test("long posts are cut, no date falls back to title", () => {
  const html = postsDigestHtml([{ title: "Draft A", text: "x".repeat(2000), scheduledAt: null }], 100);
  assert.match(html, /1\. Draft A/);
  assert.ok(html.includes("x".repeat(100) + "…") && !html.includes("x".repeat(101)));
});
