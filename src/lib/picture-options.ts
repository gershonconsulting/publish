/**
 * v0.26.0 — 3 picture options per post, real photos first (Olivier 2026-11-25:
 * "We are not satisfied with the pictures … offer the user 3 options of as
 * less as possible AI generated pictures … the user will select one of the
 * three options before submitting for validation.")
 *
 * Pure logic only (no DB, no network) so it can be tested:
 *   - keywordsFor(): turns a picture idea / post title into a short photo search;
 *   - fromOpenverse() / fromPexels(): read a stock-photo API answer;
 *   - pickThree(): the 3 options shown — real photos first, AI only to fill a gap.
 */

export type PictureSource = "pexels" | "stocksnap" | "rawpixel" | "flickr" | "wikimedia" | "openverse" | "ai";
export type PictureOption = {
  id: string;
  source: PictureSource;
  /** Shown on the card (thumbnail); for AI options a data: URL. */
  thumb: string;
  /** What is downloaded when chosen (≤ ~2000 px). Empty for AI (bytes in dataB64). */
  url: string;
  width: number | null;
  height: number | null;
  title: string;
  credit: string;
  license: string;
  /** Page of the photo, for the credit. */
  page: string;
  /** AI options only. */
  dataB64?: string;
  mime?: string;
};

/** Best looking free stock first; AI always last. */
export const SOURCE_RANK: Record<PictureSource, number> = { pexels: 0, stocksnap: 1, rawpixel: 2, wikimedia: 3, flickr: 4, openverse: 5, ai: 9 };

export const SOURCE_LABEL: Record<PictureSource, string> = {
  pexels: "Real photo · Pexels",
  stocksnap: "Real photo · StockSnap",
  rawpixel: "Real photo · rawpixel",
  flickr: "Real photo · Flickr",
  wikimedia: "Real photo · Wikimedia",
  openverse: "Real photo · Openverse",
  ai: "AI-generated",
};

const STOP = new Set(
  (
    "a an the and or of to in on at for with by from as is are be this that these those it its into over under about " +
    "professional editorial photograph photo picture image shot realistic natural light lighting high quality business context " +
    "no text words letters logos logo showing shows featuring depicting close up closeup wide angle modern clean bright " +
    "background foreground style concept scene setting view their our your his her who which while some several group " +
    "diverse people person young two three four man woman men women looking working using together around near very new"
  ).split(/\s+/),
);

/** "Professional photo of a retail store manager checking shelves, natural light" → "retail store manager shelves". */
export function keywordsFor(idea: string, max = 4): string {
  const words = String(idea || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9à-ÿ\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^-+|-+$/g, ""))
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
  const out: string[] = [];
  for (const w of words) if (!out.includes(w)) out.push(w);
  return out.slice(0, max).join(" ");
}

/** The shorter searches tried when the first one finds too little. */
export function fallbackQueries(q: string): string[] {
  const w = q.split(/\s+/).filter(Boolean);
  const out = [q];
  if (w.length > 2) out.push(w.slice(0, 2).join(" "));
  if (w.length > 1) out.push(w[0]);
  return Array.from(new Set(out)).filter(Boolean);
}

/** Stock libraries also hold logos, stickers and vectors — not photos for a post. */
const NOT_A_PHOTO = /\b(logo|png|sticker|vector|icon|illustration|mockup|clipart|template|psd|transparent)\b/i;

type OvResult = {
  id?: string; title?: string; url?: string; thumbnail?: string; creator?: string; license?: string; license_version?: string;
  source?: string; provider?: string; foreign_landing_url?: string; width?: number | null; height?: number | null; category?: string | null;
  mature?: boolean;
};

function ovSource(s: string | undefined): PictureSource {
  const v = String(s || "").toLowerCase();
  if (v === "stocksnap" || v === "rawpixel" || v === "flickr") return v;
  if (v.includes("wikimedia")) return "wikimedia";
  return "openverse";
}

/** Openverse (api.openverse.org/v1/images) answer → options. Skips illustrations, mature and tiny pictures. */
export function fromOpenverse(json: unknown): PictureOption[] {
  const rows = (json && typeof json === "object" && Array.isArray((json as { results?: unknown }).results) ? (json as { results: OvResult[] }).results : []) as OvResult[];
  const out: PictureOption[] = [];
  for (const r of rows) {
    if (!r || !r.url || !/^https:\/\//.test(r.url)) continue;
    if (r.mature) continue;
    if (r.category && r.category !== "photograph") continue;
    if (r.width && r.width < 600) continue;
    if (!/\.(jpe?g|png)(\?|$)/i.test(r.url) && !/rawpixel|stocksnap/.test(r.url)) continue;
    if (NOT_A_PHOTO.test(String(r.title || ""))) continue;
    const lic = `${String(r.license || "").toUpperCase()}${r.license_version ? " " + r.license_version : ""}`.trim();
    out.push({
      id: `ov:${r.id || r.url}`,
      source: ovSource(r.source || r.provider),
      thumb: r.thumbnail || r.url,
      url: r.url,
      width: r.width ?? null,
      height: r.height ?? null,
      title: String(r.title || "").slice(0, 140),
      credit: String(r.creator || "").slice(0, 100),
      license: lic === "CC0 1.0" || lic === "CC0" ? "CC0" : lic,
      page: r.foreign_landing_url || r.url,
    });
  }
  return out;
}

type PxPhoto = { id?: number; width?: number; height?: number; url?: string; photographer?: string; alt?: string; src?: { large2x?: string; large?: string; medium?: string } };

/** Pexels (api.pexels.com/v1/search) answer → options. */
export function fromPexels(json: unknown): PictureOption[] {
  const rows = (json && typeof json === "object" && Array.isArray((json as { photos?: unknown }).photos) ? (json as { photos: PxPhoto[] }).photos : []) as PxPhoto[];
  return rows
    .filter((p) => p && p.src && (p.src.large2x || p.src.large))
    .map((p) => ({
      id: `px:${p.id}`,
      source: "pexels" as const,
      thumb: p.src!.medium || p.src!.large || p.src!.large2x!,
      url: p.src!.large2x || p.src!.large!,
      width: p.width ?? null,
      height: p.height ?? null,
      title: String(p.alt || "").slice(0, 140),
      credit: String(p.photographer || "").slice(0, 100),
      license: "Pexels licence",
      page: p.url || "https://www.pexels.com",
    }));
}

function landscape(o: PictureOption): number {
  if (!o.width || !o.height) return 1;
  const r = o.width / o.height;
  return r >= 1.2 && r <= 2 ? 0 : r >= 1 ? 1 : 2;
}

/**
 * The 3 options: real photos first (best source, landscape, one per photographer
 * when possible), skipping ones already shown. AI fills only what is missing.
 */
export function pickThree(candidates: PictureOption[], exclude: string[] = [], n = 3): PictureOption[] {
  const seen = new Set(exclude);
  const real = candidates
    .filter((c) => c.source !== "ai" && !seen.has(c.id) && !seen.has(c.url))
    .map((c, i) => ({ c, i }))
    .sort((a, b) => SOURCE_RANK[a.c.source] - SOURCE_RANK[b.c.source] || landscape(a.c) - landscape(b.c) || a.i - b.i)
    .map((x) => x.c);
  const out: PictureOption[] = [];
  const credits = new Set<string>();
  const urls = new Set<string>();
  for (const pass of [0, 1]) {
    for (const c of real) {
      if (out.length >= n) break;
      if (out.includes(c) || urls.has(c.url)) continue;
      if (pass === 0 && c.credit && credits.has(c.credit)) continue;
      out.push(c);
      urls.add(c.url);
      if (c.credit) credits.add(c.credit);
    }
  }
  for (const c of candidates) {
    if (out.length >= n) break;
    if (c.source === "ai" && !seen.has(c.id)) out.push(c);
  }
  return out;
}

/** How many AI pictures to make so there are n options. */
export function aiNeeded(real: number, n = 3): number {
  return Math.max(0, n - real);
}

/** The line recorded on the post when an option is chosen. */
export function choiceNote(o: PictureOption, by: string): string {
  if (o.source === "ai") return `${by} chose the AI-generated picture (no real photo matched).`;
  return `${by} chose a real photo — ${SOURCE_LABEL[o.source].replace("Real photo · ", "")}${o.credit ? `, by ${o.credit}` : ""}${o.license ? ` (${o.license})` : ""}: ${o.page}`;
}
