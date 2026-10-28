// Run: npx tsx --test tests/publish-score.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/publish-score.ts";
const { healthScore, toneOf } = ((m as any).default ?? m) as typeof m;

const ok = <T,>(data: T) => ({ ok: true as const, data });
const rw = (req: number, val: number, n7 = 0) => ({ clientId: "c" + req + val, name: "Co", neededIn7: n7, thisMonth: { required: req, scheduled: val, approved: 0 }, nextMonth: { required: 0, scheduled: 0, approved: 0 } });
const aging = (fresh: number, late: number) => [{ band: "0–1 day", client: fresh, internal: 0, revision: 0 }, { band: "2–3 days", client: late, internal: 0, revision: 0 }];

test("tones", () => {
  assert.equal(toneOf(null), "off");
  assert.equal(toneOf(80), "ok");
  assert.equal(toneOf(79), "warn");
  assert.equal(toneOf(49), "bad");
});

test("all good → 100, green, no problems", () => {
  const s = healthScore({
    runways: ok([rw(10, 10)]),
    approvals: ok({ oldest: [], aging: aging(2, 0) }),
    health: ok({ networks: [{ published: 5, failed: 0, missed: 0, stuck: 0 }] }),
    conns: ok([{ clientId: "a", atRisk: 0, linkedin: "ready", x: "none" }]),
    browsers: ok([{ online: true }]),
  });
  assert.equal(s.value, 100);
  assert.equal(s.tone, "ok");
  assert.match(s.verdict, /covered/);
});

test("unmeasurable parts are left out, never 0", () => {
  const s = healthScore({
    runways: ok([rw(10, 5, 2)]),
    approvals: ok({ oldest: [], aging: aging(0, 0) }), // nothing waiting → not measured
    health: { ok: false as const, error: "db" },
    conns: ok([]),
    browsers: ok([]),
  });
  assert.equal(s.parts.find((p) => p.key === "approvals")!.value, null);
  assert.equal(s.parts.find((p) => p.key === "delivery")!.value, null);
  assert.equal(s.value, 50); // only coverage counts: 5/10
  assert.equal(s.tone, "warn");
  assert.match(s.verdict, /short of approved posts/);
});

test("weights: coverage 40, approvals 20, delivery 25, connections 15; no Chrome online caps connections", () => {
  const s = healthScore({
    runways: ok([rw(10, 0, 5)]),            // 0
    approvals: ok({ oldest: [], aging: aging(1, 1) }), // 50
    health: ok({ networks: [{ published: 3, failed: 1, missed: 0, stuck: 0 }] }), // 75
    conns: ok([{ clientId: "a", atRisk: 0, linkedin: "ready", x: "ready" }]), // 100 → capped 30 (no Chrome online)
    browsers: ok([{ online: false }]),
  });
  assert.equal(s.parts.find((p) => p.key === "connections")!.value, 30);
  assert.equal(s.value, Math.round((0 * 40 + 50 * 20 + 75 * 25 + 30 * 15) / 100));
  assert.equal(s.tone, "bad");
  assert.match(s.verdict, /no publishing Chrome is online/i);
});
