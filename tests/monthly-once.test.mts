// Run: npx tsx --test tests/monthly-once.test.mts
// v0.23.1 — the monthly client email (PUB-103) goes out once per client per month.
// Replays Resend 2026-11-17/18, Altavia (arouleau@altavia.co): PUB-103 "November 2026"
// at 2026-11-17 19:53:13Z and AGAIN at 2026-11-18 19:23:48Z.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as mm from "../src/lib/monthly-once.ts";
const m = ((mm as any).default ?? mm) as typeof mm;

const ALTAVIA = "cm_altavia_client";
const t1 = Date.parse("2026-11-17T19:53:13Z");
const t2 = Date.parse("2026-11-18T19:23:48Z");

/** A fake Resend: records every accepted email and its Idempotency-Key. */
function fakeResend(fail = 0) {
  const sent: string[] = [];
  let failures = fail;
  return {
    sent,
    send: async (idempotencyKey: string) => {
      if (failures > 0) { failures--; return false; }
      sent.push(idempotencyKey);
      return true;
    },
  };
}

test("REPRODUCES the bug: without a marker, two Autopilot steps send the month twice", async () => {
  // Old submitMonth(): every step that found new month drafts sent PUB-103 with a fresh UUID key.
  const r = fakeResend();
  for (const _run of [t1, t2]) await r.send(crypto.randomUUID());
  assert.equal(r.sent.length, 2, "old behaviour: Altavia got PUB-103 twice (Nov 17 + Nov 18)");
  assert.notEqual(r.sent[0], r.sent[1], "random keys: Resend could not stop the second one");
});

test("FIX: the same two steps send ONE email per client per month", async () => {
  const store = m.memoryStore();
  const r = fakeResend();
  assert.equal(await m.sendOncePerMonth(store, ALTAVIA, "2026-11", r.send, t1), "sent");
  assert.equal(await m.sendOncePerMonth(store, ALTAVIA, "2026-11", r.send, t2), "already_sent");
  // Even weeks later in the same month.
  assert.equal(await m.sendOncePerMonth(store, ALTAVIA, "2026-11", r.send, t2 + 20 * 864e5), "already_sent");
  assert.equal(r.sent.length, 1);
  assert.equal(r.sent[0], "publish-monthly-cm_altavia_client-2026-11");
  assert.match(store.map.get(m.monthlySentKey(ALTAVIA, "2026-11")) || "", /^sent:\d+$/);
});

test("Idempotency-Key and marker are deterministic per (client, month)", () => {
  assert.equal(m.monthlyIdempotencyKey(ALTAVIA, "2026-11"), "publish-monthly-cm_altavia_client-2026-11");
  assert.equal(m.monthlySentKey(ALTAVIA, "2026-11"), "monthly_sent:2026-11:cm_altavia_client");
  assert.notEqual(m.monthlyIdempotencyKey(ALTAVIA, "2026-11"), m.monthlyIdempotencyKey(ALTAVIA, "2026-12"));
  assert.notEqual(m.monthlyIdempotencyKey(ALTAVIA, "2026-11"), m.monthlyIdempotencyKey("other", "2026-11"));
  assert.ok(m.monthlyIdempotencyKey("x".repeat(400), "2026-11").length <= 256);
});

test("another month or another client still gets its own email", async () => {
  const store = m.memoryStore();
  const r = fakeResend();
  assert.equal(await m.sendOncePerMonth(store, ALTAVIA, "2026-11", r.send, t1), "sent");
  assert.equal(await m.sendOncePerMonth(store, ALTAVIA, "2026-12", r.send, t2), "sent");
  assert.equal(await m.sendOncePerMonth(store, "cm_amphasys", "2026-11", r.send, t2), "sent");
  assert.equal(r.sent.length, 3);
});

test("a failed send releases the claim, so the next step retries (never lost)", async () => {
  const store = m.memoryStore();
  const r = fakeResend(1);
  assert.equal(await m.sendOncePerMonth(store, ALTAVIA, "2026-11", r.send, t1), "failed");
  assert.equal(store.map.has(m.monthlySentKey(ALTAVIA, "2026-11")), false);
  assert.equal(await m.sendOncePerMonth(store, ALTAVIA, "2026-11", r.send, t1 + 60000), "sent");
  assert.equal(r.sent.length, 1);
});

test("a send that throws is treated as failed", async () => {
  const store = m.memoryStore();
  const out = await m.sendOncePerMonth(store, ALTAVIA, "2026-11", async () => { throw new Error("network"); }, t1);
  assert.equal(out, "failed");
  assert.equal(store.map.size, 0);
});

test("two concurrent steps (cron + page) → one email", async () => {
  const store = m.memoryStore();
  const r = fakeResend();
  const slow = async (k: string) => { await new Promise((res) => setTimeout(res, 20)); return r.send(k); };
  const out = await Promise.all([
    m.sendOncePerMonth(store, ALTAVIA, "2026-11", slow, t1),
    m.sendOncePerMonth(store, ALTAVIA, "2026-11", slow, t1),
  ]);
  assert.deepEqual(out.sort(), ["already_sent", "sent"]);
  assert.equal(r.sent.length, 1);
});

test("a stale pending claim (crash mid-send) is taken over; a fresh one blocks", () => {
  assert.equal(m.markerBlocks(null, t1), false);
  assert.equal(m.markerBlocks(m.claimValue("sent", t1), t1 + 365 * 864e5), true);
  assert.equal(m.markerBlocks(m.claimValue("pending", t1), t1 + 60000), true);
  assert.equal(m.markerBlocks(m.claimValue("pending", t1), t1 + m.STALE_CLAIM_MS + 1), false);
  assert.equal(m.markerBlocks("garbage", t1), true, "unknown value: never risk a second client email");
});

test("bad month key is refused", async () => {
  await assert.rejects(() => m.sendOncePerMonth(m.memoryStore(), ALTAVIA, "2026-13", async () => true, t1));
  await assert.rejects(() => m.sendOncePerMonth(m.memoryStore(), "", "2026-11", async () => true, t1));
});

test("post announcements: same text + same pictures = same key; a new picture = new key", () => {
  // Altavia 2026-11-18: PUB-105 (v4) at 18:01Z, then PUB-101 for the same v4 at 18:24Z.
  const pics = m.pictureSig(["media2", "media1"]);
  assert.equal(pics, m.pictureSig(["media1", "media2", "media1"]));
  assert.equal(m.announcedKey("item9", 4, pics), m.announcedKey("item9", 4, m.pictureSig(["media1", "media2"])));
  assert.notEqual(m.announcedKey("item9", 4, pics), m.announcedKey("item9", 5, pics));
  assert.notEqual(m.announcedKey("item9", 4, pics), m.announcedKey("item9", 4, m.pictureSig(["media3"])));
  assert.equal(m.pictureSig([]), "");
  assert.equal(m.announcedKey("item9", 4, ""), "client_announced:item9@4");
});
