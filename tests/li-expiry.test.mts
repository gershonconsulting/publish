// Run: npx tsx --test tests/li-expiry.test.mts
// v0.14.0 — personal LinkedIn connections: when to ask the person for a new "Allow".
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/li-expiry.ts";
const { liEffectiveExpiry, liExpiryState, liShouldRemind } = ((m as any).default ?? m) as typeof m;

const now = Date.parse("2026-11-09T12:00:00Z");
const d = (n: number) => new Date(now + n * 86400000).toISOString();

test("refresh token extends the end date", () => {
  assert.equal(liEffectiveExpiry({ refreshToken: "r", expiresAt: d(60), refreshExpiresAt: d(365) }), d(365));
  assert.equal(liEffectiveExpiry({ refreshToken: null, expiresAt: d(60), refreshExpiresAt: d(365) }), d(60));
  assert.equal(liEffectiveExpiry({ refreshToken: "r", expiresAt: d(60), refreshExpiresAt: null }), d(60));
});
test("states", () => {
  assert.equal(liExpiryState(d(30), now), "ok");
  assert.equal(liExpiryState(d(10), now), "soon");
  assert.equal(liExpiryState(d(1), now), "soon");
  assert.equal(liExpiryState(d(-1), now), "expired");
  assert.equal(liExpiryState("garbage", now), "expired");
});
test("one reminder per state, never while ok", () => {
  assert.equal(liShouldRemind(d(30), null, now).send, false);
  const a = liShouldRemind(d(5), null, now);
  assert.equal(a.send, true);
  assert.equal(liShouldRemind(d(5), a.stamp, now).send, false);
  const b = liShouldRemind(d(5), a.stamp, now + 6 * 86400000); // now expired
  assert.equal(b.state, "expired");
  assert.equal(b.send, true);
  // reconnected → new expiry date → a fresh reminder cycle later
  assert.equal(liShouldRemind(d(55), b.stamp, now + 50 * 86400000).send, true);
});
