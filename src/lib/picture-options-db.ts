/**
 * v0.26.0 — 3 picture options per post (real photos first). Network + DB side
 * of lib/picture-options.ts.
 *
 * Sources, best first: Unsplash / Pexels / Pixabay (each only when its key is set:
 * UNSPLASH_ACCESS_KEY, PEXELS_API_KEY, PIXABAY_API_KEY) → Openverse
 * (no key: StockSnap and rawpixel CC0 stock, then Flickr/Wikimedia photos free
 * for commercial use) → Workers AI only for the slots no real photo filled.
 *
 * The options shown for a post are kept in org_settings `pic_options:<postId>`
 * (no schema change), so reopening the post shows the same 3.
 */
import prisma from "@/lib/db-raw";
import { addEvent, MEDIA_SELECT, markChanged } from "@/lib/publishing";
import { aiNeeded, choiceNote, fallbackQueries, fromOpenverse, fromPexels, fromPixabay, fromUnsplash, keywordsFor, pickThree, type PictureOption } from "@/lib/picture-options";

const UA = "GershonPublish/1.0 (+https://publish.gershon.ai)";
const MAX_BYTES = 5 * 1024 * 1024;
type Cache = { query: string; shown: string[]; options: PictureOption[]; at: string };

const env = (k: string): string | undefined => {
  try {
    return (process.env as Record<string, string | undefined>)[k];
  } catch {
    return undefined;
  }
};

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function searchPexels(q: string): Promise<PictureOption[]> {
  const key = env("PEXELS_API_KEY");
  if (!key) return [];
  return fromPexels(await getJson(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=15&orientation=landscape`, { Authorization: key }));
}

/** v0.28.1: Unsplash — only when UNSPLASH_ACCESS_KEY is set. */
async function searchUnsplash(q: string): Promise<PictureOption[]> {
  const key = env("UNSPLASH_ACCESS_KEY");
  if (!key) return [];
  return fromUnsplash(await getJson(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=15&orientation=landscape&content_filter=high`, { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" }));
}

/** v0.28.1: Pixabay — only when PIXABAY_API_KEY is set. */
async function searchPixabay(q: string): Promise<PictureOption[]> {
  const key = env("PIXABAY_API_KEY");
  if (!key) return [];
  const p = new URLSearchParams({ key, q: q.slice(0, 100), image_type: "photo", orientation: "horizontal", safesearch: "true", per_page: "20", order: "popular" });
  return fromPixabay(await getJson(`https://pixabay.com/api/?${p}`));
}

/** Unsplash asks to be told when a photo is used (download_location). Never blocks. */
async function trackUse(o: PictureOption): Promise<void> {
  const key = env("UNSPLASH_ACCESS_KEY");
  if (o.source !== "unsplash" || !o.track || !key || !/^https:\/\/api\.unsplash\.com\//.test(o.track)) return;
  await fetch(o.track, { headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" } }).catch(() => null);
}

async function searchOpenverse(q: string, source?: string): Promise<PictureOption[]> {
  const p = new URLSearchParams({ q, page_size: "20", mature: "false" });
  if (source) p.set("source", source);
  else {
    p.set("license_type", "commercial");
    p.set("category", "photograph");
  }
  return fromOpenverse(await getJson(`https://api.openverse.org/v1/images/?${p}`));
}

/**
 * Every real photo found for a search, best sources first. Stock libraries
 * (Pexels, StockSnap, rawpixel) are tried with shorter and shorter searches
 * BEFORE any general Flickr/Wikimedia photo (event shots, real people), which
 * only fill what stock could not.
 */
export async function searchRealPhotos(query: string): Promise<PictureOption[]> {
  const stock: PictureOption[] = [];
  const queries = fallbackQueries(query);
  for (const q of queries) {
    const found = await Promise.all([searchUnsplash(q), searchPexels(q), searchPixabay(q), searchOpenverse(q, "stocksnap"), searchOpenverse(q, "rawpixel")]);
    for (const f of found) stock.push(...f);
    if (stock.length >= 6) return stock;
  }
  if (stock.length >= 3) return stock;
  const general: PictureOption[] = [];
  for (const q of queries) {
    general.push(...(await searchOpenverse(q)));
    if (general.length >= 6) break;
  }
  return [...stock, ...general];
}

/** The picture idea of a post: Autopilot's note, else its title and first line. */
async function ideaOf(orgId: string, itemId: string): Promise<{ idea: string; clientId: string | null } | null> {
  const it = await prisma.contentItem.findFirst({
    where: { id: itemId, organizationId: orgId },
    select: { title: true, text: true, clientId: true, comments: { where: { body: { contains: "Picture idea: " } }, select: { body: true }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!it) return null;
  const note = (it.comments[0]?.body || "").split("Picture idea: ")[1] || "";
  return { idea: note || `${it.title || ""} ${(it.text || "").split("\n")[0]}`, clientId: it.clientId };
}

async function readCache(orgId: string, itemId: string): Promise<Cache | null> {
  const r = await prisma.orgSetting.findUnique({ where: { organizationId_key: { organizationId: orgId, key: `pic_options:${itemId}` } } });
  if (!r) return null;
  try {
    return JSON.parse(r.value) as Cache;
  } catch {
    return null;
  }
}
async function writeCache(orgId: string, itemId: string, c: Cache): Promise<void> {
  const key = `pic_options:${itemId}`;
  const value = JSON.stringify(c);
  await prisma.orgSetting.upsert({ where: { organizationId_key: { organizationId: orgId, key } }, create: { organizationId: orgId, key, value }, update: { value } });
}

async function aiOptions(orgId: string, clientId: string | null, idea: string, n: number): Promise<PictureOption[]> {
  if (n <= 0) return [];
  const { makePicture } = await import("@/lib/autopilot");
  const { brandPaletteFor } = await import("@/lib/knowledge-base");
  const palette = await brandPaletteFor(orgId, clientId).catch(() => "");
  const out: PictureOption[] = [];
  for (let i = 0; i < n; i++) {
    const pic = await makePicture(idea, palette).catch(() => null);
    if (!pic) break;
    out.push({
      id: `ai:${Date.now()}-${i}`, source: "ai", thumb: `data:${pic.mime};base64,${pic.dataB64}`, url: "",
      width: pic.width, height: pic.height, title: idea.slice(0, 140), credit: "", license: "", page: "", dataB64: pic.dataB64, mime: pic.mime,
    });
  }
  return out;
}

/**
 * The 3 options for a post. `refresh` = 3 other ones (the ones already shown are
 * skipped); `query` = the team typed their own search words.
 */
export async function findOptions(orgId: string, itemId: string, o: { refresh?: boolean; query?: string } = {}): Promise<Cache | null> {
  const base = await ideaOf(orgId, itemId);
  if (!base) return null;
  const prev = await readCache(orgId, itemId);
  if (prev && !o.refresh && !o.query) return prev;
  const query = (o.query || "").trim().slice(0, 80) || (prev && o.refresh ? prev.query : "") || keywordsFor(base.idea) || "business team";
  const shown = o.refresh && prev && (!o.query || o.query === prev.query) ? prev.shown : [];
  let options = pickThree(await searchRealPhotos(query), shown);
  if (options.length < 3) options = [...options, ...(await aiOptions(orgId, base.clientId, base.idea, aiNeeded(options.length)))];
  const c: Cache = { query, shown: [...shown, ...options.map((x) => x.id)].slice(-60), options, at: new Date().toISOString() };
  await writeCache(orgId, itemId, c);
  return c;
}

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Download a real photo: JPEG/PNG, ≤ 5 MB. */
async function download(o: PictureOption): Promise<{ dataB64: string; mime: string } | null> {
  if (o.source === "ai") return o.dataB64 ? { dataB64: o.dataB64, mime: o.mime || "image/jpeg" } : null;
  for (const url of [o.url, o.thumb]) {
    if (!url || !/^https:\/\//.test(url)) continue;
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (!r.ok) continue;
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (bytes.length < 2000 || bytes.length > MAX_BYTES) continue;
      const png = bytes[0] === 0x89 && bytes[1] === 0x50;
      const jpg = bytes[0] === 0xff && bytes[1] === 0xd8;
      if (!png && !jpg) continue;
      await trackUse(o);
      return { dataB64: b64(bytes), mime: png ? "image/png" : "image/jpeg" };
    } catch {
      /* next url */
    }
  }
  return null;
}

async function store(orgId: string, contentId: string, o: PictureOption, pic: { dataB64: string; mime: string }) {
  const k = new Uint8Array(16);
  crypto.getRandomValues(k);
  await prisma.contentMedia.deleteMany({ where: { contentId } });
  await prisma.contentMedia.create({
    data: {
      organizationId: orgId, contentId, key: Array.from(k, (x) => x.toString(16).padStart(2, "0")).join(""), position: 0, mime: pic.mime,
      name: `${o.source}${pic.mime === "image/png" ? ".png" : ".jpg"}`, width: o.width, height: o.height,
      sizeBytes: Math.floor((pic.dataB64.length * 3) / 4), dataB64: pic.dataB64,
    },
    select: MEDIA_SELECT,
  });
}

/** v0.27.0: the bytes of every option currently shown (to send them to the client to choose). */
export async function optionsBytes(orgId: string, itemId: string): Promise<{ o: PictureOption; dataB64: string; mime: string }[]> {
  const c = await readCache(orgId, itemId);
  const out: { o: PictureOption; dataB64: string; mime: string }[] = [];
  for (const o of c?.options || []) {
    const pic = await download(o);
    if (pic) out.push({ o, ...pic });
  }
  return out;
}

/** The team picked one of the 3: it becomes the post's picture. */
export async function chooseOption(orgId: string, itemId: string, optionId: string, by: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const item = await prisma.contentItem.findFirst({ where: { id: itemId, organizationId: orgId }, include: { deliveries: true } });
  if (!item) return { ok: false, error: "Not found" };
  if (item.deliveries.some((d) => d.status === "POSTED" || d.status === "POSTING")) return { ok: false, error: "Already published — the picture can't change now." };
  const c = await readCache(orgId, itemId);
  const o = c?.options.find((x) => x.id === optionId);
  if (!o) return { ok: false, error: "These options expired — show the options again." };
  const pic = await download(o);
  if (!pic) return { ok: false, error: "That picture could not be downloaded — pick another one." };
  await store(orgId, itemId, o, pic);
  await addEvent(orgId, itemId, item.version, "comment", "team", by, choiceNote(o, by));
  if (["IN_REVIEW", "APPROVED", "SCHEDULED", "FAILED"].includes(item.status)) await markChanged(orgId, itemId, by, "Picture replaced");
  return { ok: true };
}

/**
 * No one to choose (Autopilot "auto" mode, a client asking for another picture):
 * the best real photo, AI only if none is found. Returns false when nothing worked.
 */
export async function attachBestPicture(orgId: string, itemId: string, idea: string): Promise<boolean> {
  const it = await prisma.contentItem.findFirst({ where: { id: itemId, organizationId: orgId }, select: { clientId: true } });
  if (!it) return false;
  const query = keywordsFor(idea) || "business team";
  for (const o of pickThree(await searchRealPhotos(query))) {
    const pic = await download(o);
    if (pic) {
      await store(orgId, itemId, o, pic);
      await addEvent(orgId, itemId, 1, "comment", "team", "Autopilot", choiceNote(o, "Autopilot"));
      return true;
    }
  }
  const [ai] = await aiOptions(orgId, it.clientId, idea, 1);
  if (!ai) return false;
  await store(orgId, itemId, ai, { dataB64: ai.dataB64!, mime: ai.mime || "image/jpeg" });
  return true;
}
