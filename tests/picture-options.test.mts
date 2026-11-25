// Run: npx tsx --test tests/picture-options.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/picture-options.ts";
const { keywordsFor, fallbackQueries, fromOpenverse, fromPexels, pickThree, aiNeeded, choiceNote } = ((m as any).default ?? m) as typeof m;

const ov = (source: string, n: number, extra: Record<string, unknown> = {}) => ({
  id: `${source}${n}`, title: `t${n}`, url: `https://cdn.example.com/${source}/${n}.jpg`, thumbnail: `https://api.openverse.org/thumb/${source}${n}`,
  creator: `${source}-author-${n}`, license: "cc0", license_version: "1.0", source, foreign_landing_url: `https://x/${n}`, width: 1600, height: 1000, category: "photograph", ...extra,
});

test("keywords drop the AI-prompt filler", () => {
  assert.equal(keywordsFor("Professional editorial photograph of a retail store manager checking shelves, natural light, no text"), "retail store manager checking");
  assert.equal(keywordsFor(""), "");
});

test("fallback searches get shorter", () => {
  assert.deepEqual(fallbackQueries("retail store manager shelves"), ["retail store manager shelves", "retail store", "retail"]);
});

test("Openverse: keeps photos, skips mature, tiny, illustrations and logos", () => {
  const o = fromOpenverse({ results: [ov("stocksnap", 1), ov("flickr", 2, { mature: true }), ov("flickr", 3, { width: 300 }), ov("flickr", 4, { category: "illustration" }), ov("rawpixel", 5, { title: "Twistlock logo png sticker" })] });
  assert.equal(o.length, 1);
  assert.equal(o[0].source, "stocksnap");
  assert.equal(o[0].license, "CC0");
  assert.deepEqual(fromOpenverse(null), []);
});

test("Pexels answer is read", () => {
  const o = fromPexels({ photos: [{ id: 7, width: 4000, height: 2600, url: "https://www.pexels.com/photo/7", photographer: "Ana", alt: "Shop", src: { large2x: "https://images.pexels.com/7-l2.jpg", medium: "https://images.pexels.com/7-m.jpg" } }] });
  assert.equal(o[0].source, "pexels");
  assert.equal(o[0].url, "https://images.pexels.com/7-l2.jpg");
});

test("3 options: best source first, different photographers, AI only to fill", () => {
  const real = fromOpenverse({ results: [ov("flickr", 1), ov("stocksnap", 2), ov("stocksnap", 3), ov("rawpixel", 4)] });
  const ai = { id: "ai:1", source: "ai" as const, thumb: "data:", url: "", width: 1024, height: 1024, title: "", credit: "", license: "", page: "" };
  const three = pickThree([...real, ai]);
  assert.deepEqual(three.map((x) => x.source), ["stocksnap", "stocksnap", "rawpixel"]);
  assert.ok(!three.some((x) => x.source === "ai"));
  // only one real photo → AI fills the other two slots
  assert.equal(aiNeeded(pickThree(real.slice(0, 1)).length), 2);
  const mixed = pickThree([real[0], ai]);
  assert.deepEqual(mixed.map((x) => x.source), ["flickr", "ai"]);
});

test("'3 others' never repeats what was shown", () => {
  const real = fromOpenverse({ results: Array.from({ length: 6 }, (_, k) => ov("stocksnap", k)) });
  const first = pickThree(real);
  const next = pickThree(real, first.map((x) => x.id));
  assert.equal(next.length, 3);
  assert.ok(next.every((x) => !first.includes(x)));
});

test("same photographer only when nothing else", () => {
  const same = fromOpenverse({ results: [ov("stocksnap", 1, { creator: "A" }), ov("stocksnap", 2, { creator: "A" }), ov("flickr", 3, { creator: "B" })] });
  assert.deepEqual(pickThree(same).map((x) => x.credit), ["A", "B", "A"]);
});

test("choice note credits the photographer", () => {
  const [o] = fromOpenverse({ results: [ov("stocksnap", 1)] });
  assert.match(choiceNote(o, "Nikki"), /Nikki chose a real photo — StockSnap, by stocksnap-author-1 \(CC0\)/);
});
