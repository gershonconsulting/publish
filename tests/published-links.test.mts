// Run: npx tsx --test tests/published-links.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/published-links.ts";
const { liveLink, snippet } = ((m as any).default ?? m) as typeof m;

test("recorded post URL wins", () => {
  assert.deepEqual(liveLink({ platform: "LINKEDIN", postUrl: "https://www.linkedin.com/feed/update/urn:li:activity:1/", target: "https://www.linkedin.com/company/acme" }),
    { href: "https://www.linkedin.com/feed/update/urn:li:activity:1/", kind: "post" });
});

test("X falls back to the status id, then the handle", () => {
  assert.deepEqual(liveLink({ platform: "TWITTER", externalPostId: "1855" }), { href: "https://x.com/i/status/1855", kind: "post" });
  assert.deepEqual(liveLink({ platform: "TWITTER", target: "@alexrouleau" }), { href: "https://x.com/alexrouleau", kind: "page" });
});

test("LinkedIn without URL opens the page it was posted on", () => {
  assert.deepEqual(liveLink({ platform: "LINKEDIN", externalPostId: "99", target: "linkedin.com/in/alexandre-rouleau-7141544" }),
    { href: "https://linkedin.com/in/alexandre-rouleau-7141544", kind: "page" });
});

test("nothing usable → null; javascript: refused", () => {
  assert.equal(liveLink({ platform: "LINKEDIN" }), null);
  assert.equal(liveLink({ platform: "LINKEDIN", postUrl: "javascript:alert(1)" }), null);
});

test("snippet keeps the first non-empty line, trimmed", () => {
  assert.equal(snippet("\n  Hello world  \nmore"), "Hello world");
  assert.equal(snippet("x".repeat(200), 10).length, 10);
});
