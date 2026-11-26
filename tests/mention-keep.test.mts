// Run: npx tsx --test tests/mention-keep.test.mts
// v0.28.2 — tags asked for in a comment are kept in BOTH versions.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/company-tag.ts";
const { mentionsIn, keepMentions, withLinkedInTag, withXTag, hasTag } = ((m as any).default ?? m) as typeof m;

const comment = "We need to add @Altavia and link it to our page. Add #MarketingExecution";
const li = "When it comes to retail media in pharma, a common myth is that regulatory accuracy slows down the process.\n\nWhat's your experience?\n\n#retailmedia #pharma #MarketingExecution";

test("finds the tag the client asked for", () => {
  assert.deepEqual(mentionsIn(comment), ["Altavia"]);
});
test("ignores email addresses", () => {
  assert.deepEqual(mentionsIn("write to arouleau@altavia.co please"), []);
});
test("Altavia bug: LinkedIn version gets the missing tag above the hashtags", () => {
  const r = keepMentions(li, mentionsIn(comment), (t, n) => withLinkedInTag(t, n, 3000));
  assert.ok(hasTag(r.text, "Altavia"));
  assert.match(r.text, /\n\n@Altavia\n\n#retailmedia/);
  assert.deepEqual(r.missing, []);
});
test("X version already tagged stays unchanged", () => {
  const x = "Myth-busting: speed & accuracy can coexist. #retailmedia #pharma #MarketingExecution @Altavia";
  const r = keepMentions(x, ["Altavia"], (t, n) => withXTag(t, n, 280));
  assert.equal(r.text, x);
});
test("a tag the old post had and the AI dropped comes back", () => {
  const old = "Old text\n\n@Altavia\n\n#retailmedia";
  const ai = "New text\n\n#retailmedia";
  const r = keepMentions(ai, mentionsIn(old), (t, n) => withLinkedInTag(t, n, 3000));
  assert.ok(hasTag(r.text, "Altavia"));
});
test("@Altavia is not satisfied by @AltaviaGroup", () => {
  const r = keepMentions("Hi @AltaviaGroup", ["Altavia"], (t, n) => withLinkedInTag(t, n, 3000));
  assert.ok(/\n\n@Altavia$/.test(r.text));
});
test("reports a tag that cannot fit", () => {
  const r = keepMentions("x".repeat(20), ["Altavia"], (t, n) => withLinkedInTag(t, n, 20));
  assert.deepEqual(r.missing, ["Altavia"]);
});
