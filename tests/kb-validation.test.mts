// Run: npx tsx --test tests/kb-validation.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/kb-validation-logic.ts";
const v = ((m as any).default ?? m) as typeof m;

const T = "2026-10-21T00:00:00.000Z";
const kb = (over: Partial<{ vp: string; icpDesc: string; style: string }> = {}) => ({
  valueProp: { text: over.vp ?? "We help productions cut carbon.", source: "ai" as const, updatedAt: T },
  competitive: { notes: "Greenscreen, EcoAct.", source: "ai" as const, updatedAt: T },
  icps: [
    { id: "a1", name: "Sustainability Manager", description: over.icpDesc ?? "At a production company.", source: "ai" as const, updatedAt: T },
    { id: "b2", name: "Producer", description: "Independent.", source: "ai" as const, updatedAt: T },
  ],
  style: { text: over.style ?? "", source: "manual" as const, updatedAt: null },
});
const ok = (section: string) => ({ section, status: "ok" as const, name: "Nicolette" });
function must<T>(r: T | { error: string }): T {
  if (r && typeof r === "object" && "error" in (r as object)) throw new Error((r as { error: string }).error);
  return r as T;
}

test("sections: value prop, competitive, one per ICP; house style only when written", () => {
  assert.deepEqual(v.sectionsOf(kb()).map((s) => s.id), ["valueProp", "competitive", "icp:a1", "icp:b2"]);
  assert.deepEqual(v.sectionsOf(kb({ style: "Short, warm." })).map((s) => s.id).at(-1), "style");
});

test("client level is closed until every section passed the internal check", () => {
  const secs = v.sectionsOf(kb());
  let st = structuredClone(v.EMPTY_STATE);
  assert.deepEqual(v.applyVerdict(st, secs, "client", ok("valueProp")), { error: "This review is not open yet." });
  for (const id of ["valueProp", "competitive", "icp:a1"]) st = must(v.applyVerdict(st, secs, "internal", ok(id))).state;
  assert.equal(st.releasedAt, null);
  const last = must(v.applyVerdict(st, secs, "internal", ok("icp:b2")));
  assert.equal(last.completedNow, true);
  assert.ok(last.state.releasedAt);
  assert.equal(v.summarize(secs, last.state.internal).complete, true);
  assert.ok(!("error" in v.applyVerdict(last.state, secs, "client", ok("valueProp"))));
});

test("Needs changes requires a comment", () => {
  const secs = v.sectionsOf(kb());
  assert.deepEqual(v.applyVerdict(v.EMPTY_STATE, secs, "internal", { section: "valueProp", status: "changes", comment: "  " }), { error: "Tell us what to change." });
  const r = must(v.applyVerdict(v.EMPTY_STATE, secs, "internal", { section: "valueProp", status: "changes", comment: "Wrong market" }));
  assert.equal(v.statusOf(secs[0], r.state.internal.valueProp), "changes");
});

test("editing a section sends it back to 'to check'; other sections keep their verdict", () => {
  let secs = v.sectionsOf(kb());
  let st = structuredClone(v.EMPTY_STATE);
  for (const s of secs) st = must(v.applyVerdict(st, secs, "internal", ok(s.id))).state;
  secs = v.sectionsOf(kb({ icpDesc: "At a broadcaster." }));
  const sum = v.summarize(secs, st.internal);
  assert.deepEqual([sum.ok, sum.pending, sum.complete], [3, 1, false]);
  assert.ok(st.releasedAt, "a later edit does not close the client link again");
  // Same text with trailing spaces: still counts as validated.
  secs = v.sectionsOf(kb({ vp: "We help productions cut carbon.  \n" }));
  assert.equal(v.statusOf(secs[0], st.internal.valueProp), "ok");
});

test("unknown section and tokens", () => {
  assert.deepEqual(v.applyVerdict(v.EMPTY_STATE, v.sectionsOf(kb()), "internal", ok("icp:zz")), { error: "This section does not exist any more. Reload the page." });
  assert.equal(v.levelOfToken("ki_" + "a".repeat(36)), "internal");
  assert.equal(v.levelOfToken("kc_" + "0".repeat(36)), "client");
  assert.equal(v.levelOfToken("a".repeat(36)), null);
  assert.equal(v.levelOfToken("ki_" + "A".repeat(36)), null);
});

test("parseState drops malformed verdicts", () => {
  const st = v.parseState(JSON.stringify({ internal: { valueProp: { status: "ok", fp: "x", at: T }, bad: { status: "maybe", fp: "x" } }, releasedAt: 5 }));
  assert.deepEqual(Object.keys(st.internal), ["valueProp"]);
  assert.equal(st.releasedAt, null);
  assert.deepEqual(v.parseState("{not json"), v.EMPTY_STATE);
});
