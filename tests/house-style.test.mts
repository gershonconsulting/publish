// Run: npx tsx --test tests/house-style.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/house-style-stats.ts";
const { houseStyleStats, statsForPrompt } = ((m as any).default ?? m) as typeof m;

const post = (date: string, text: string, o: Partial<{ platform: string; likes: number; comments: number; shares: number; media: boolean }> = {}) => ({
  platform: o.platform ?? "LINKEDIN",
  text,
  publishedAtUtc: new Date(date + "T14:00:00Z"),
  hasMedia: !!o.media,
  likes: o.likes ?? 0,
  comments: o.comments ?? 0,
  shares: o.shares ?? 0,
  url: null,
});

test("no posts → nothing measured, nothing shown as 0", () => {
  const s = houseStyleStats([]);
  assert.equal(s.posts, 0);
  assert.equal(s.perWeek, null);
  assert.equal(s.avgChars, null);
  assert.equal(s.emojiPct, null);
  assert.equal(s.avgEngagement, null);
  assert.equal(statsForPrompt(s), "");
});

test("rhythm, length, hashtags, habits, voice", () => {
  const posts = [
    post("2026-01-05", "We help our clients grow in the US. Are you ready? #USmarket #growth 🚀", { likes: 10, media: true }),
    post("2026-01-12", "Our team met with partners this week. We loved it. https://example.com #USmarket", { likes: 2 }),
    post("2026-01-19", "We are hiring. Join our team and help us build.\n\nApply now. #hiring", { likes: 4, comments: 2 }),
    post("2026-02-02", "Short one from us: we will be at the show. #USmarket", { platform: "TWITTER", likes: 1 }),
  ];
  const s = houseStyleStats(posts);
  assert.equal(s.posts, 4);
  assert.equal(s.firstDate, "2026-01-05");
  assert.equal(s.lastDate, "2026-02-02");
  assert.equal(s.perWeek, 1); // 4 posts over 4 weeks
  assert.deepEqual(s.byPlatform, [{ platform: "LINKEDIN", posts: 3 }, { platform: "TWITTER", posts: 1 }]);
  assert.equal(s.topHashtags[0].tag, "#usmarket");
  assert.equal(s.topHashtags[0].count, 3);
  assert.equal(s.avgHashtags, 1.3);
  assert.equal(s.emojiPct, 25);
  assert.equal(s.linkPct, 25);
  assert.equal(s.questionPct, 25);
  assert.equal(s.mediaPct, 25);
  assert.equal(s.voice?.main, "we");
  // engagement = likes + 3×comments + 5×shares → post 1 (10) beats post 3 (4+6=10, older wins on tie? newer first)
  assert.equal(s.topPosts.length, 4);
  assert.equal(s.topPosts[0].engagement, 10);
  assert.ok(statsForPrompt(s).includes("4 posts collected"));
});

test("under two weeks of history → rhythm not measurable", () => {
  const s = houseStyleStats([post("2026-03-01", "We are here and ready to help."), post("2026-03-04", "We ship our product today, finally.")]);
  assert.equal(s.perWeek, null);
});

test("no engagement collected → no best posts, examples = most recent", () => {
  const s = houseStyleStats([
    post("2026-01-01", "An older post about how we work with founders across Europe and the US."),
    post("2026-02-01", "The newest post about our approach to opening a US office the right way."),
  ]);
  assert.equal(s.avgEngagement, null);
  assert.equal(s.bestWeekday, null);
  assert.equal(s.topPosts.length, 0);
  assert.ok(s.examples[0].startsWith("The newest"));
});

test("posts without readable text count for rhythm, not for style", () => {
  const s = houseStyleStats([post("2026-01-01", ""), post("2026-01-20", "", { media: true })]);
  assert.equal(s.posts, 2);
  assert.equal(s.withText, 0);
  assert.equal(s.avgChars, null);
  assert.equal(s.voice, null);
  assert.equal(s.mediaPct, 50);
});
