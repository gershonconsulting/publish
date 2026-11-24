// Run: npx tsx --test tests/company-tag.test.mts
// v0.22.0 — @company on every post + working days only.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/company-tag.ts";
import * as w from "../src/lib/work-days.ts";
const { parseLinkedInOrg, withLinkedInTag, withXTag, liCommentary, hasTag, liSegments } = ((m as any).default ?? m) as typeof m;
const { isWeekendYmd, nextWorkday, firstFreeWorkday, toWorkday, etDay } = ((w as any).default ?? w) as typeof w;

test("LinkedIn org id from urn, number or company URL", () => {
  assert.equal(parseLinkedInOrg("urn:li:organization:123456"), "urn:li:organization:123456");
  assert.equal(parseLinkedInOrg("123456"), "urn:li:organization:123456");
  assert.equal(parseLinkedInOrg("https://www.linkedin.com/company/123456/admin/"), "urn:li:organization:123456");
  assert.equal(parseLinkedInOrg("https://www.linkedin.com/company/altavia/"), null);
  assert.equal(parseLinkedInOrg(""), null);
});

test("LinkedIn tag goes above the closing hashtags, once", () => {
  const t = "Retail media is growing.\n\nHere is why.\n\n#RetailMedia #Retail";
  const out = withLinkedInTag(t, "Altavia", 3000);
  assert.equal(out, "Retail media is growing.\n\nHere is why.\n\n@Altavia\n\n#RetailMedia #Retail");
  assert.equal(withLinkedInTag(out, "Altavia", 3000), out);
  assert.equal(withLinkedInTag("Thanks @altavia for this.", "Altavia", 3000), "Thanks @altavia for this.");
  assert.equal(withLinkedInTag("No hashtags here.", "Altavia", 3000), "No hashtags here.\n\n@Altavia");
  assert.equal(withLinkedInTag("x".repeat(2999), "Altavia", 3000), "x".repeat(2999)); // never over the limit
  assert.ok(!hasTag("@AltaviaGroup rocks", "Altavia"));
});

test("X tag before hashtags, fits the limit", () => {
  assert.equal(withXTag("Retail media 101. #RetailMedia", "altavia_na", 280), "Retail media 101. @altavia_na #RetailMedia");
  assert.equal(withXTag("Hello @Altavia_NA", "altavia_na", 280), "Hello @Altavia_NA");
  const long = "A".repeat(279);
  const out = withXTag(long, "altavia", 280);
  assert.ok(Array.from(out).length <= 280 && out.endsWith("@altavia"));
});

test("LinkedIn commentary: real mention, rest escaped", () => {
  const c = liCommentary("Proud of @Altavia (Montreal) #Retail", [{ name: "Altavia", urn: "urn:li:organization:42" }]);
  assert.equal(c, "Proud of @[Altavia](urn:li:organization:42) \\(Montreal\\) {hashtag|\\#|Retail}");
  assert.equal(liCommentary("Hi @Altavia"), "Hi \\@Altavia");
});

test("working days only", () => {
  assert.equal(isWeekendYmd("2026-11-21"), true); // Saturday
  assert.equal(isWeekendYmd("2026-11-23"), false); // Monday
  assert.equal(nextWorkday("2026-11-22"), "2026-11-23");
  assert.equal(firstFreeWorkday("2026-11-21", new Set(["2026-11-23", "2026-11-24"])), "2026-11-25");
  // Saturday 09:30 New York → Monday 09:30 New York (DST-safe)
  const sat = new Date("2026-11-21T14:30:00Z");
  const mon = toWorkday(sat);
  assert.equal(etDay(mon), "2026-11-23");
  assert.equal(mon.toISOString(), "2026-11-23T14:30:00.000Z");
  const fri = new Date("2026-11-20T14:30:00Z");
  assert.equal(toWorkday(fri).getTime(), fri.getTime());
});

test("liSegments: plain text without a tag stays one piece", () => {
  assert.deepEqual(liSegments("Hello world", ["Altavia"]), [{ text: "Hello world" }]);
  assert.deepEqual(liSegments("Hello", []), [{ text: "Hello" }]);
  assert.deepEqual(liSegments("", ["Altavia"]), []);
});

test("liSegments: the tag above the hashtags becomes a mention piece", () => {
  const t = "Retail media is growing.\n\n@Altavia\n\n#RetailMedia";
  const s = liSegments(t, ["Altavia"]);
  assert.deepEqual(s, [{ text: "Retail media is growing.\n\n" }, { mention: "Altavia" }, { text: "\n\n#RetailMedia" }]);
  const back = s.map((x) => ("mention" in x ? "@" + x.mention : x.text)).join("");
  assert.equal(back, t);
});

test("liSegments: no partial match, longest name wins, several mentions", () => {
  assert.deepEqual(liSegments("@AltaviaGroup rocks", ["Altavia"]), [{ text: "@AltaviaGroup rocks" }]);
  assert.deepEqual(liSegments("with @Altavia North America!", ["Altavia", "Altavia North America"]),
    [{ text: "with " }, { mention: "Altavia North America" }, { text: "!" }]);
  assert.deepEqual(liSegments("@Altavia and @altavia", ["Altavia"]),
    [{ mention: "Altavia" }, { text: " and " }, { mention: "altavia" }]);
});
