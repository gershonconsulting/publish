// Run: npx tsx --test tests/review-thread.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/review-thread.ts";
const { clientVisibleEvents } = ((m as any).default ?? m) as typeof m;

let t = 0;
const ev = (kind: string, authorRole: string, body: string | null, authorName: string | null = "X") =>
  ({ id: String(++t), authorName, authorRole, kind, body, version: 1, createdAt: new Date(Date.UTC(2026, 10, 10, 0, t)).toISOString() });

test("internal exchange (team comments + revisions from them) is hidden", () => {
  const out = clientVisibleEvents([
    ev("comment", "team", "An actual photograph of Alexandre", "Olivier Attia"),
    ev("revised", "team", "New version 2 written from Olivier Attia's comment", "Intelligence"),
    ev("comment", "team", "You can put the old visual back.", "Olivier Attia"),
    ev("revised", "team", "New version 4 written from Olivier Attia's comment", "Intelligence"),
    ev("edited", "team", "x"),
  ]);
  assert.deepEqual(out, []);
});

test("external exchange with the client stays visible", () => {
  const out = clientVisibleEvents([
    ev("submitted", "team", "batch:Altavia — Nov", "Olivier"),
    ev("comment", "team", "internal note", "Olivier"),
    ev("comment", "client", "Please change the picture", "Alexandre"),
    ev("revised", "team", "New version 2 written from Alexandre's comment", "Intelligence"),
    ev("comment", "team", "internal again", "Olivier"),
    ev("revised", "team", "New version 3 written from Olivier's comment", "Intelligence"),
    ev("approved", "client", null, "Alexandre"),
  ]);
  assert.deepEqual(out.map((e) => e.kind), ["submitted", "comment", "revised", "approved"]);
  assert.equal(out[0].body, "batch:Altavia — Nov");
  assert.equal(out[1].body, "Please change the picture");
  assert.match(out[2].body!, /Alexandre/);
});
