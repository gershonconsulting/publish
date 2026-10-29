/**
 * House style — the numbers (v0.10.0). PURE: no database, no AI, tested in
 * tests/house-style.test.mts.
 *
 * Olivier, 2026-10-28: "In the knowledge base we should have the data
 * collected by social.gershon.ai about the posts previously posted by the
 * company, so we know what is the style of the company before we took over
 * the social content publishing."
 *
 * Input = the company's own posts collected by Social (SocialPost rows),
 * already restricted to the ones published BEFORE Gershon took over
 * (see house-style.ts). Output = how that company wrote: rhythm, length,
 * hashtags, emoji, links, pictures, questions, voice ("we" / "I" / "you"),
 * what worked best. A number that cannot be measured is null, never 0.
 */

export type HistoryPost = {
  platform: string;
  text: string;
  publishedAtUtc: Date;
  hasMedia: boolean;
  likes: number;
  comments: number;
  shares: number;
  url: string | null;
};

export type HouseStyleStats = {
  posts: number;
  firstDate: string | null;
  lastDate: string | null;
  perWeek: number | null;
  byPlatform: Array<{ platform: string; posts: number }>;
  /** Posts with readable text (the length/voice numbers use only these). */
  withText: number;
  avgChars: number | null;
  medianChars: number | null;
  avgParagraphs: number | null;
  avgHashtags: number | null;
  topHashtags: Array<{ tag: string; count: number }>;
  /** Shares of posts with text, 0-100. */
  emojiPct: number | null;
  linkPct: number | null;
  questionPct: number | null;
  mediaPct: number | null;
  voice: { we: number; i: number; you: number; main: "we" | "I" | "you" | "mixed" } | null;
  avgEngagement: number | null;
  bestWeekday: string | null;
  topPosts: Array<{ date: string; platform: string; text: string; engagement: number; url: string | null }>;
  examples: string[];
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const EMOJI = /\p{Extended_Pictographic}/u;
const LINK = /(https?:\/\/|www\.)\S+/i;
const HASHTAG = /(^|\s)#([\p{L}\p{N}_]{2,60})/gu;

export const engagementOf = (p: Pick<HistoryPost, "likes" | "comments" | "shares">) => p.likes + p.comments * 3 + p.shares * 5;

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);
const day = (d: Date) => d.toISOString().slice(0, 10);

function count(re: RegExp, s: string): number {
  const m = s.toLowerCase().match(re);
  return m ? m.length : 0;
}

export function houseStyleStats(all: HistoryPost[]): HouseStyleStats {
  const posts = [...all].sort((a, b) => a.publishedAtUtc.getTime() - b.publishedAtUtc.getTime());
  const n = posts.length;
  const empty: HouseStyleStats = {
    posts: 0, firstDate: null, lastDate: null, perWeek: null, byPlatform: [], withText: 0,
    avgChars: null, medianChars: null, avgParagraphs: null, avgHashtags: null, topHashtags: [],
    emojiPct: null, linkPct: null, questionPct: null, mediaPct: null, voice: null,
    avgEngagement: null, bestWeekday: null, topPosts: [], examples: [],
  };
  if (!n) return empty;

  const first = posts[0].publishedAtUtc;
  const last = posts[n - 1].publishedAtUtc;
  const weeks = (last.getTime() - first.getTime()) / (7 * 86400000);
  // Under two weeks of history a weekly rhythm means nothing.
  const perWeek = weeks >= 2 ? round1(n / weeks) : null;

  const plat = new Map<string, number>();
  for (const p of posts) plat.set(p.platform, (plat.get(p.platform) || 0) + 1);

  const texted = posts.filter((p) => p.text.trim().length >= 20);
  const t = texted.length;
  const lens = texted.map((p) => p.text.trim().length).sort((a, b) => a - b);
  const tags = new Map<string, number>();
  let tagTotal = 0, emoji = 0, link = 0, question = 0, paragraphs = 0, we = 0, i = 0, you = 0;
  for (const p of texted) {
    const s = p.text;
    const found = [...s.matchAll(HASHTAG)].map((m) => m[2].toLowerCase());
    tagTotal += found.length;
    for (const f of new Set(found)) tags.set(f, (tags.get(f) || 0) + 1);
    if (EMOJI.test(s)) emoji++;
    if (LINK.test(s)) link++;
    if (s.includes("?")) question++;
    paragraphs += s.split(/\n\s*\n|\n/).filter((x) => x.trim()).length;
    we += count(/\b(we|our|us|we're|we've)\b/g, s);
    i += count(/\b(i|my|me|i'm|i've)\b/g, s);
    you += count(/\b(you|your|you're)\b/g, s);
  }
  const voiceTotal = we + i + you;
  let voice: HouseStyleStats["voice"] = null;
  if (voiceTotal >= 5) {
    const share = { we: Math.round((we / voiceTotal) * 100), i: Math.round((i / voiceTotal) * 100), you: Math.round((you / voiceTotal) * 100) };
    const top = Math.max(share.we, share.i, share.you);
    const main = top < 45 ? "mixed" : top === share.we ? "we" : top === share.i ? "I" : "you";
    voice = { ...share, main };
  }

  // Engagement is only meaningful if Social collected at least one reaction.
  const eng = posts.map(engagementOf);
  const anyEng = eng.some((e) => e > 0);
  const byDay = new Map<number, { n: number; e: number }>();
  posts.forEach((p, k) => {
    const d = p.publishedAtUtc.getUTCDay();
    const v = byDay.get(d) || { n: 0, e: 0 };
    v.n++; v.e += eng[k];
    byDay.set(d, v);
  });
  let bestWeekday: string | null = null;
  if (anyEng) {
    let best = -1;
    for (const [d, v] of byDay) {
      if (v.n < 2) continue;
      const avg = v.e / v.n;
      if (avg > best) { best = avg; bestWeekday = WEEKDAYS[d]; }
    }
  }

  const ranked = texted
    .map((p) => ({ p, e: engagementOf(p) }))
    .sort((a, b) => b.e - a.e || b.p.publishedAtUtc.getTime() - a.p.publishedAtUtc.getTime());
  const topPosts = (anyEng ? ranked : []).slice(0, 5).map(({ p, e }) => ({
    date: day(p.publishedAtUtc), platform: p.platform, text: p.text.trim().slice(0, 600), engagement: e, url: p.url,
  }));
  // Examples for the writer: best performers first, else the most recent.
  const exSource = anyEng ? ranked.map((r) => r.p) : [...texted].reverse();
  const examples = exSource.filter((p) => p.text.trim().length > 60).slice(0, 6).map((p) => p.text.trim().slice(0, 500));

  return {
    posts: n,
    firstDate: day(first),
    lastDate: day(last),
    perWeek,
    byPlatform: [...plat].map(([platform, posts]) => ({ platform, posts })).sort((a, b) => b.posts - a.posts),
    withText: t,
    avgChars: t ? Math.round(lens.reduce((a, b) => a + b, 0) / t) : null,
    medianChars: t ? lens[Math.floor((t - 1) / 2)] : null,
    avgParagraphs: t ? round1(paragraphs / t) : null,
    avgHashtags: t ? round1(tagTotal / t) : null,
    topHashtags: [...tags].map(([tag, count]) => ({ tag: "#" + tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)).slice(0, 10),
    emojiPct: pct(emoji, t),
    linkPct: pct(link, t),
    questionPct: pct(question, t),
    mediaPct: pct(posts.filter((p) => p.hasMedia).length, n),
    voice,
    avgEngagement: anyEng ? round1(eng.reduce((a, b) => a + b, 0) / n) : null,
    bestWeekday,
    topPosts,
    examples,
  };
}

const PLATFORM_LABEL: Record<string, string> = { LINKEDIN: "LinkedIn", TWITTER: "X" };
export const platformLabel = (p: string) => PLATFORM_LABEL[p] || p.charAt(0) + p.slice(1).toLowerCase();

/** Plain-English lines for a prompt (and for the page summary). Unknown numbers are left out. */
export function statsForPrompt(s: HouseStyleStats): string {
  if (!s.posts) return "";
  const l: string[] = [];
  l.push(`${s.posts} posts collected between ${s.firstDate} and ${s.lastDate} (${s.byPlatform.map((b) => `${b.posts} ${platformLabel(b.platform)}`).join(", ")})${s.perWeek !== null ? `, about ${s.perWeek} per week` : ""}.`);
  if (s.avgChars !== null) l.push(`Length: about ${s.avgChars} characters on average (median ${s.medianChars}), ${s.avgParagraphs} paragraphs/lines.`);
  if (s.avgHashtags !== null) l.push(`Hashtags: ${s.avgHashtags} per post${s.topHashtags.length ? `; most used ${s.topHashtags.slice(0, 6).map((h) => h.tag).join(", ")}` : ""}.`);
  const habits = [
    s.emojiPct !== null ? `${s.emojiPct}% use emoji` : "",
    s.linkPct !== null ? `${s.linkPct}% contain a link` : "",
    s.questionPct !== null ? `${s.questionPct}% ask a question` : "",
    s.mediaPct !== null ? `${s.mediaPct}% have a picture or video` : "",
  ].filter(Boolean);
  if (habits.length) l.push(`Habits: ${habits.join(", ")}.`);
  if (s.voice) l.push(`Voice: ${s.voice.main === "mixed" ? "mixed" : `mainly "${s.voice.main}"`} (we ${s.voice.we}%, I ${s.voice.i}%, you ${s.voice.you}%).`);
  if (s.bestWeekday) l.push(`Best day for engagement: ${s.bestWeekday}.`);
  return l.join("\n");
}
