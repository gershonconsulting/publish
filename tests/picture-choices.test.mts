// Run: npx tsx --test tests/picture-choices.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/picture-choices-model.ts";
const { addChoice, removeChoice, pictureCount, approveBlock, withoutData, approveAllNote, MAX_CHOICES } = ((m as any).default ?? m) as typeof m;

const c = (id: string) => ({ id, mime: "image/jpeg", dataB64: "AAAA", width: 10, height: 10, label: id, at: "2026-11-25" });

test("up to 3 pictures, a 4th is refused", () => {
  let list: ReturnType<typeof c>[] = [];
  for (const id of ["a", "b", "c"]) list = addChoice(list, c(id)).list;
  assert.equal(list.length, MAX_CHOICES);
  const r = addChoice(list, c("d"));
  assert.match(r.error || "", /Up to 3/);
  assert.equal(r.list.length, 3);
  assert.deepEqual(removeChoice(list, "b").map((x) => x.id), ["a", "c"]);
});

test("pictures to choose from count as the post's picture for review", () => {
  assert.equal(pictureCount(0, 0), 0);
  assert.equal(pictureCount(0, 3), 1);
  assert.equal(pictureCount(1, 0), 1);
});

test("approve is blocked until the client chooses", () => {
  assert.equal(approveBlock(3), "Choose one of the 3 pictures first.");
  assert.equal(approveBlock(0), null);
});

test("no bytes sent with the list", () => {
  assert.ok(!("dataB64" in withoutData(c("a"))));
});

test("Approve all note", () => {
  assert.equal(approveAllNote(4, 0), null);
  assert.equal(approveAllNote(4, 1), "4 approved. 1 post still needs you to choose a picture.");
  assert.equal(approveAllNote(0, 2), "2 posts still need you to choose a picture.");
});
