// Run: npx tsx --test tests/conn-log.test.mts
// v0.20.0 — connection history per company.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/conn-log-model.ts";
const { diffLinked, reconcile, appendEvents, loggedStatus, describe, netState, MAX_EVENTS } = ((m as any).default ?? m) as typeof m;

const now = Date.parse("2026-11-17T12:00:00Z");
const d = (n: number) => new Date(now + n * 86400000).toISOString();
const li = (o: Partial<any> = {}) => ({
  expiresAt: d(60), refreshToken: null, refreshExpiresAt: null, connectedAt: d(-5), lastError: null,
  author: "urn:li:organization:1", authors: [{ urn: "urn:li:organization:1", name: "Altavia", vanity: "altavia", kind: "organization" }], ...o,
});
const person = (o: Partial<any> = {}) => li({ personal: true, vanity: "alex", author: "urn:li:person:9", authors: [{ urn: "urn:li:person:9", name: "Alexandre Rouleau", vanity: "alex", kind: "person" }], ...o });
const x = (o: Partial<any> = {}) => ({ expiresAt: d(0.05), refreshToken: "r", connectedAt: d(-3), lastError: null, username: "alexrouleau", ...o });
const at = new Date(now).toISOString();

test("connect and disconnect are logged with who did it", () => {
  const e1 = diffLinked({}, { linkedin: person() }, at, "Alexandre Rouleau (connect link)", now);
  assert.equal(e1.length, 1);
  assert.equal(e1[0].kind, "connected");
  assert.equal(e1[0].personal, true);
  assert.match(e1[0].as!, /Alexandre Rouleau \(in\/alex\)/);
  assert.equal(e1[0].by, "Alexandre Rouleau (connect link)");
  const e2 = diffLinked({ linkedin: person(), x: x() }, { linkedin: null, x: x() }, at, "Olivier", now);
  assert.deepEqual(e2.map((e) => [e.net, e.kind, e.as]), [["linkedin", "disconnected", "Alexandre Rouleau (in/alex)"]]);
});

test("a failure and its recovery are logged once", () => {
  const bad = diffLinked({ linkedin: li() }, { linkedin: li({ lastError: "token revoked" }) }, at, null, now);
  assert.deepEqual(bad.map((e) => [e.kind, e.detail]), [["error", "token revoked"]]);
  assert.equal(diffLinked({ linkedin: li({ lastError: "token revoked" }) }, { linkedin: li({ lastError: "token revoked" }) }, at, null, now).length, 0);
  assert.deepEqual(diffLinked({ linkedin: li({ lastError: "x" }) }, { linkedin: li() }, at, null, now).map((e) => e.kind), ["recovered"]);
});

test("a new Allow is a reconnect; an automatic token refresh is not noise", () => {
  assert.deepEqual(diffLinked({ linkedin: li() }, { linkedin: li({ connectedAt: d(0) }) }, at, "Olivier", now).map((e) => e.kind), ["reconnected"]);
  assert.equal(diffLinked({ x: x() }, { x: x({ expiresAt: d(0.08) }) }, at, null, now).length, 0);
});

test("page change is logged", () => {
  const two = li({ authors: [...li().authors, { urn: "urn:li:organization:2", name: "Other", vanity: null, kind: "organization" }] });
  const ev = diffLinked({ linkedin: two }, { linkedin: { ...two, author: "urn:li:organization:2" } }, at, "Olivier", now);
  assert.deepEqual(ev.map((e) => e.kind), ["changed"]);
});

test("expiry nobody saved is caught by reconcile, dated at the real expiry", () => {
  const log = appendEvents([], diffLinked({}, { linkedin: person({ expiresAt: d(-2) }) }, d(-62), null, Date.parse(d(-62))));
  assert.equal(loggedStatus(log, "linkedin"), "connected");
  const add = reconcile(log, { linkedin: person({ expiresAt: d(-2) }) }, now);
  assert.deepEqual(add.filter((e) => e.net === "linkedin").map((e) => [e.kind, e.at]), [["expired", d(-2)]]);
  assert.equal(reconcile(appendEvents(log, add), { linkedin: person({ expiresAt: d(-2) }) }, now).length, 0);
});

test("first sight: current connections written with their own date, missing ones as 'not connected'", () => {
  const add = reconcile([], { linkedin: li() }, now);
  assert.deepEqual(add.map((e) => [e.net, e.kind, e.at, !!e.inferred]), [["linkedin", "connected", d(-5), true], ["x", "seen", at, true]]);
  assert.equal(loggedStatus(add, "x"), "none");
  assert.equal(reconcile(appendEvents([], add), { linkedin: li() }, now).length, 0);
  // later the X account gets connected → normal event
  assert.deepEqual(diffLinked({ linkedin: li() }, { linkedin: li(), x: x() }, at, null, now).map((e) => [e.net, e.kind]), [["x", "connected"]]);
});

test("refresh token extends LinkedIn; X with refresh never expires on its own", () => {
  assert.equal(netState({ linkedin: li({ expiresAt: d(-1), refreshToken: "r", refreshExpiresAt: d(300) }) }, "linkedin", now).status, "connected");
  assert.equal(netState({ x: x({ expiresAt: d(-1) }) }, "x", now).status, "connected");
  assert.equal(netState({ x: x({ expiresAt: d(-1), refreshToken: null }) }, "x", now).status, "expired");
});

test("log is sorted, capped and has no token", () => {
  const many = Array.from({ length: MAX_EVENTS + 20 }, (_, i) => ({ at: d(-i), net: "x" as const, kind: "error" as const, as: null }));
  const out = appendEvents([], many);
  assert.equal(out.length, MAX_EVENTS);
  assert.ok(out[0].at < out[out.length - 1].at);
  const ev = diffLinked({}, { linkedin: li({ accessToken: "SECRET" } as any) }, at, null, now);
  assert.ok(!JSON.stringify(ev).includes("SECRET"));
  assert.equal(describe(ev[0]), "LinkedIn page connected — Altavia");
});
