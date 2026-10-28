// Run: npx tsx --test tests/sweep-digest.test.mts   (or node --experimental-strip-types --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../src/lib/sweep-digest.ts";
import * as dd from "../src/lib/alert-dedupe.ts";
const d = ((m as any).default ?? m) as typeof m;
const a = ((dd as any).default ?? dd) as typeof dd;

function mem(): dd.AlertStore & { m: Map<string, string> } {
  const map = new Map<string, string>();
  return { m: map, get: async (k) => map.get(k) ?? null, set: async (k, v) => void map.set(k, v) };
}
const DAY = 86400000, T0 = Date.UTC(2026, 9, 23, 15, 30);
const COMPANIES = ["PuenteLatin", "LINALYSIS", "Gershon Consulting", "AmericanAbroad"];
const xMissed = (n: number): m.DigestEntry[] => COMPANIES.map((c) => ({
  kind: "missed", company: c, network: "X", reason: "The publishing Chrome is signed in to X as @oattia, not this company's account.",
  link: `https://publish.gershon.ai/publishing/calendar?client=${c}&item=i${n}`, when: "scheduled Oct 23, 2026, 11:30 AM (New York)", excerpt: `Post ${n}`,
}));
const liOut = (pending: number): m.DigestEntry => ({
  kind: "signed_out", company: "Gershon Consulting, LINALYSIS", network: "LinkedIn", reason: "LinkedIn signed the publishing browser out.",
  link: "https://publish.gershon.ai/publishing/calendar", when: "since Oct 27, 2026", pending,
});

/** What sweep() does: ledger-filter the posts, then ONE email for posts + sign-outs. */
async function sweep(store: dd.AlertStore, posts: dd.FailedPost[], entries: m.DigestEntry[], outs: m.DigestEntry[], now: number, sent: string[]) {
  const fresh = new Set((await a.newFailures(store, posts, now)).map((p) => p.id));
  const rows = [...entries.filter((_, i) => fresh.has(posts[i].id)), ...outs];
  if (!rows.length) return;
  sent.push(d.digestSubject(rows));
  await a.markAlerted(store, posts.filter((p) => fresh.has(p.id)), now);
}
const failed = (n: number): dd.FailedPost[] => COMPANIES.map((c) => ({ id: `d${n}-${c}`, contentId: `${c}-${n}`, platform: "TWITTER", target: null, scheduledAtMs: T0 + n * DAY }));

test("audit day 10-27: 4 X misses + LinkedIn signed out -> ONE email, one subject", async () => {
  const s = mem(); const sent: string[] = [];
  await sweep(s, failed(4), xMissed(4), [liOut(3)], T0 + 4 * DAY, sent);
  assert.equal(sent.length, 1);
  assert.equal(sent[0], "4 posts did not go out today — LinkedIn signed out");
});

test("5 days of the same 4-company failure -> 5 emails (one a day, new posts), never 4 a day", async () => {
  const s = mem(); const sent: string[] = [];
  for (let n = 0; n < 5; n++) {
    await sweep(s, failed(n), xMissed(n), [], T0 + n * DAY, sent);
    await sweep(s, failed(n), xMissed(n), [], T0 + n * DAY + 900000, sent); // the next 15-min sweep: nothing new
  }
  assert.equal(sent.length, 5);
  assert.ok(sent.every((x) => x === "4 posts did not go out today"));
});

test("subject: one post / only sign-outs", () => {
  assert.equal(d.digestSubject(xMissed(0).slice(0, 1)), "1 post did not go out today");
  assert.equal(d.digestSubject([liOut(1)]), "LinkedIn signed out — 1 scheduled post is on hold");
  assert.equal(d.digestSubject([liOut(2), { ...liOut(3), network: "X" }]), "LinkedIn + X signed out — 5 scheduled posts are on hold");
});

test("body: company, network, reason and direct link for every row; posts before sign-outs; HTML escaped", () => {
  const html = d.digestHtml([liOut(3), ...xMissed(1), { ...xMissed(1)[0], company: "A<b>", reason: "x & y" }]);
  for (const c of COMPANIES) {
    assert.ok(html.includes(`<b>${c}</b>`), c);
    assert.ok(html.includes(`href="https://publish.gershon.ai/publishing/calendar?client=${c}&amp;item=i1"`), `link ${c}`);
  }
  assert.ok(html.includes("signed in to X as @oattia"));
  assert.ok(html.includes("3 scheduled posts waiting"));
  assert.ok(html.includes("A&lt;b&gt;") && html.includes("x &amp; y"));
  assert.ok(html.indexOf("AmericanAbroad") < html.indexOf("Signed out — posts on hold"), "posts first");
  assert.equal((html.match(/<tr>/g) || []).length, 1 + 6); // header + 6 rows
});

test("PUB-201 inventory: sent only when the state changed vs the last one SENT", async () => {
  const s = mem();
  const eight = Array.from({ length: 8 }, (_, i) => ({ clientId: `c${i}`, level: "critical" }));
  const sig = d.inventorySig(eight);
  assert.equal(await d.inventoryChanged(s, "team", sig), true); // day 1: send
  await d.saveInventorySig(s, "team", sig);
  for (let day = 2; day <= 7; day++) assert.equal(await d.inventoryChanged(s, "team", d.inventorySig([...eight].reverse())), false); // days 2-7: same 8 -> no email
  assert.equal(await d.inventoryChanged(s, "team", d.inventorySig(eight.slice(0, 7))), true); // count changed
  assert.equal(await d.inventoryChanged(s, "team", d.inventorySig([...eight.slice(0, 7), { clientId: "c7", level: "low" }])), true); // status changed
  assert.equal(await d.inventoryChanged(s, "team", d.inventorySig([...eight.slice(0, 7), { clientId: "c7", level: "critical", overdueReviews: 2 }])), true); // new overdue review
  assert.equal(await d.inventoryChanged(s, "ops", sig), true); // the Content Ready report keeps its own state
});

test("PUB-201: a failed send is not remembered; an unreadable store sends", async () => {
  const s = mem();
  const sig = d.inventorySig([{ clientId: "c1", level: "critical" }]);
  assert.equal(await d.inventoryChanged(s, "team", sig), true); // email failed -> saveInventorySig not called
  assert.equal(await d.inventoryChanged(s, "team", sig), true);
  const broken: dd.AlertStore = { get: async () => { throw new Error("db down"); }, set: async () => { throw new Error("db down"); } };
  assert.equal(await d.inventoryChanged(broken, "team", sig), true);
  await d.saveInventorySig(broken, "team", sig); // does not throw
});
