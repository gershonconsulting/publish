// Run: npx tsx --test tests/x-links.test.mts
// v0.7.3 — X posts go out with no link (X bills a URL post $0.20 vs $0.015, replies too).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/x-links.ts";
const { stripLinks } = ((m as any).default ?? m) as typeof m;

const cases: [string, string][] = [
  ["US market entry is a marathon. Read more: https://gershonconsulting.com/blog/x #USMarket", "US market entry is a marathon. #USMarket"],
  ["We just published our 2026 guide on US expansion. Download it at https://gershon.ai/guide. #USMarket #B2B", "We just published our 2026 guide on US expansion. #USMarket #B2B"],
  ["Our CEO spoke at SaaStr (recording: https://youtu.be/abc) about channel sales.", "Our CEO spoke at SaaStr about channel sales."],
  ["New case study with Valos https://valos.com/case is live!", "New case study with Valos is live!"],
  ["Join us at CES 👉 www.valos.com/ces", "Join us at CES"],
  ["Line one\n\nLearn more here → https://x.co/abc\n#B2B", "Line one\n\n#B2B"],
];
test("links are removed and the post still reads", () => {
  for (const [input, want] of cases) assert.equal(stripLinks(input).text, want);
});
test("handles, emails, version numbers and plain posts are untouched", () => {
  for (const t of ["Thanks @oattia and olivier@gershonconsulting.com! Version 1.5 works.", "Plain post without links #SaaS"]) {
    const r = stripLinks(t);
    assert.equal(r.text, t);
    assert.equal(r.removed.length, 0);
  }
});
