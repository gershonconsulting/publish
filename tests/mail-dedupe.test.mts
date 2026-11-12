// Run: npx tsx --test tests/mail-dedupe.test.mts
// v0.18.2 — Publish email floods (Resend 2026-11-10, Altavia).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as mm from "../src/lib/mail-dedupe.ts";
const m = ((mm as any).default ?? mm) as typeof mm;

const at = (hms: string) => Date.parse(`2026-11-10T${hms}Z`);

test("idempotency key is deterministic per (email, New York day, event)", () => {
  const k1 = m.mailIdempotencyKey("PUB-202", at("19:51:45"), ["org1", "social@x", "itemA@1"]);
  const k2 = m.mailIdempotencyKey("PUB-202", at("19:52:58"), ["org1", "social@x", "itemA@1"]);
  assert.equal(k1, k2, "same event, same day → same key (Resend delivers once)");
  assert.match(k1, /^pub202-2026-11-10-[0-9a-f]{16}$/);
  // A different post, a new version, another email number or recipient is a different event.
  assert.notEqual(k1, m.mailIdempotencyKey("PUB-202", at("19:51:45"), ["org1", "social@x", "itemB@1"]));
  assert.notEqual(k1, m.mailIdempotencyKey("PUB-202", at("19:51:45"), ["org1", "social@x", "itemA@2"]));
  assert.notEqual(k1, m.mailIdempotencyKey("PUB-204", at("19:51:45"), ["org1", "social@x", "itemA@1"]));
  // Recipient case does not matter.
  assert.equal(k1, m.mailIdempotencyKey("PUB-202", at("19:51:45"), ["org1", "SOCIAL@X", "itemA@1"]));
  // New York day: 2026-11-11 03:00Z is still Nov 10 in New York; 06:00Z is Nov 11.
  assert.equal(k1, m.mailIdempotencyKey("PUB-202", Date.parse("2026-11-11T03:00:00Z"), ["org1", "social@x", "itemA@1"]));
  assert.notEqual(k1, m.mailIdempotencyKey("PUB-202", Date.parse("2026-11-11T06:00:00Z"), ["org1", "social@x", "itemA@1"]));
  assert.ok(k1.length <= 256);
});

test("sortedIds makes id lists order-independent", () => {
  assert.equal(m.sortedIds(["b", "a", null, "b"]), "a,b");
});

test("burst window: hold within 10 minutes of the last email, flush after", () => {
  const last = at("19:51:45");
  assert.equal(m.burstHeld(null, last), false);
  assert.equal(m.burstHeld(last, at("19:52:58")), true);
  assert.equal(m.burstHeld(last, last + m.BURST_WINDOW_MS - 1), true);
  assert.equal(m.burstHeld(last, last + m.BURST_WINDOW_MS), false);
  assert.equal(m.flushDue(last, at("19:55:00")), false);
  assert.equal(m.flushDue(last, at("20:02:00")), true);
  assert.equal(m.burstHeld(NaN, last), false, "unreadable state → send now");
});

test("PUB-101 and PUB-102 share the client's window", () => {
  assert.equal(m.burstGroup("REVIEW_ONE"), m.burstGroup("REVIEW_BATCH"));
  assert.equal(m.lastSentKey("REVIEW_BATCH", "c1"), m.lastSentKey("REVIEW_ONE", "c1"));
  assert.notEqual(m.burstGroup("CLIENT_CHANGES"), m.burstGroup("READY_FOR_PUBLISHING"));
});

function ev(id: string, atMs: number, mail: mm.BurstMail, extra: Partial<mm.HeldEvent> = {}): mm.HeldEvent {
  return {
    id, at: atMs, mail, clientId: "altavia", to: "reviewer@altavia.example", audience: "client",
    subject: "Gershon Consulting Publish - Altavia (Alexandre) - November 2026",
    subjectMany: "Gershon Consulting Publish - Altavia (Alexandre) - November 2026",
    intro: "<p>Hi Alexandre,</p>", html: `<p>post ${id}</p>`, cta: { href: "https://publish.gershon.ai/review/t", label: "Review" }, ...extra,
  };
}

test("held events combine into one email, greeting once, PUB-101s become a PUB-102", () => {
  const c = m.combineHeld([ev("a", 1, "REVIEW_ONE"), ev("b", 2, "REVIEW_ONE"), ev("c", 3, "REVIEW_ONE")]);
  assert.equal(c.mail, "REVIEW_BATCH");
  assert.equal(c.html.split("Hi Alexandre").length - 1, 1);
  for (const id of ["a", "b", "c"]) assert.ok(c.html.includes(`post ${id}`));
  const one = m.combineHeld([ev("a", 1, "REVIEW_ONE")]);
  assert.equal(one.mail, "REVIEW_ONE");
  const ch = m.combineHeld([ev("x", 1, "CLIENT_CHANGES", { subjectMany: "Altavia asked for changes ({n} requests)" }), ev("y", 2, "CLIENT_CHANGES")]);
  assert.equal(ch.subject, "Altavia asked for changes (2 requests)");
});

test("groupHeld separates companies, kinds and recipients; oldest first", () => {
  const g = m.groupHeld([
    ev("2", 2, "CLIENT_CHANGES"), ev("1", 1, "CLIENT_CHANGES"),
    ev("3", 3, "CLIENT_CHANGES", { clientId: "other" }),
    ev("4", 4, "KB_VALIDATION"),
  ]);
  assert.equal(g.length, 3);
  assert.deepEqual(g[0].map((e) => e.id), ["1", "2"]);
});

test("parseHeld rejects junk", () => {
  assert.equal(m.parseHeld("not json"), null);
  assert.equal(m.parseHeld(JSON.stringify({ id: 1 })), null);
  assert.equal(m.parseHeld(JSON.stringify(ev("a", 1, "REVIEW_ONE")))?.id, "a");
});

/** Replays the 2026-11-10 Resend timeline through burstSend + sweep's flush (pure model). */
function replay(sends: { t: number; mail: mm.BurstMail; id: string; batch?: boolean }[], sweepEvery = 60_000) {
  const last = new Map<string, number>();
  let held: mm.HeldEvent[] = [];
  const out: { t: number; mail: string; n: number }[] = [];
  const flush = (now: number) => {
    for (const g of m.groupHeld(held)) {
      if (!m.flushDue(last.get(m.lastSentKey(g[0].mail, g[0].clientId)) ?? null, now)) continue;
      out.push({ t: now, mail: m.combineHeld(g).mail, n: g.length });
      last.set(m.lastSentKey(g[0].mail, g[0].clientId), now);
      held = held.filter((e) => !g.includes(e));
    }
  };
  const start = sends[0].t, end = sends[sends.length - 1].t + 3 * m.BURST_WINDOW_MS;
  let i = 0;
  for (let now = start; now <= end; now += 1000) {
    while (i < sends.length && sends[i].t <= now) {
      const s = sends[i++];
      const k = m.lastSentKey(s.mail, "altavia");
      if (!s.batch && m.burstHeld(last.get(k) ?? null, now)) held.push(ev(s.id, now, s.mail));
      else { out.push({ t: now, mail: s.batch ? "REVIEW_BATCH" : s.mail, n: 1 }); last.set(k, now); }
    }
    if ((now - start) % sweepEvery === 0) flush(now);
  }
  return out;
}

test("2026-11-10 replay: PUB-202 x5 → 2 emails, PUB-204 x4 → 2, client PUB-102 x2 + PUB-101 x3 → 3", () => {
  const p202 = replay(["19:51:45", "19:52:45", "19:52:50", "19:52:56", "19:52:58"].map((h, i) => ({ t: at(h), mail: "READY_FOR_PUBLISHING" as const, id: `p${i}` })));
  assert.equal(p202.length, 2);
  assert.equal(p202[1].n, 4, "the four later approvals arrive together");
  assert.ok(p202[1].t - at("19:51:45") <= m.BURST_WINDOW_MS + 60_000, "held at most window + one sweep");

  const p204 = replay(["19:50:23", "19:51:05", "19:51:39", "19:52:35"].map((h, i) => ({ t: at(h), mail: "CLIENT_CHANGES" as const, id: `c${i}` })));
  assert.equal(p204.length, 2);

  const client = replay([
    { t: at("14:17:06"), mail: "REVIEW_ONE", id: "b1", batch: true },
    { t: at("14:22:16"), mail: "REVIEW_ONE", id: "b2", batch: true },
    { t: at("14:23:06"), mail: "REVIEW_ONE", id: "r1" },
    { t: at("14:24:12"), mail: "REVIEW_ONE", id: "r2" },
    { t: at("14:25:14"), mail: "REVIEW_ONE", id: "r3" },
  ]);
  assert.equal(client.length, 3);
  assert.deepEqual(client.map((c) => c.mail), ["REVIEW_BATCH", "REVIEW_BATCH", "REVIEW_BATCH"]);
  assert.equal(client[2].n, 3);
});

test("a lone event is never delayed", () => {
  const r = replay([{ t: at("15:00:00"), mail: "KB_VALIDATION", id: "k" }]);
  assert.deepEqual(r.map((x) => x.t), [at("15:00:00")]);
});
