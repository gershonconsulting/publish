/**
 * Brand identity in the Knowledge Base (v0.18.0, Olivier 2026-11-10).
 *
 * A client pointed out that the branding — colour codes, fonts, logo, how the
 * brand must look — belongs in the Knowledge Base too. We take it from the
 * company's website, or from what the client shared with us (brand book,
 * guidelines PDF, pasted text). What the client shared wins over the website.
 *
 * Pure logic only (no DB, no network), so it can be tested on its own:
 *   - extractFromSite(): colours / fonts / logo found in the site's HTML + CSS;
 *   - brandText() / parseBrandText(): the readable text shown for validation,
 *     and back (the internal reviewer can correct it on the review page);
 *   - brandForPrompt() / paletteForImage(): what the writers and the picture
 *     model are told.
 */

export type BrandColor = { name: string; hex: string; role: string };
export type Brand = {
  colors: BrandColor[];
  fonts: string;
  logoUrl: string;
  notes: string;
  source: "ai" | "manual";
  /** Where it came from: "Website https://…", a file name the client shared, or null. */
  from: string | null;
  updatedAt: string | null;
};

export const EMPTY_BRAND: Brand = { colors: [], fonts: "", logoUrl: "", notes: "", source: "manual", from: null, updatedAt: null };

export function hasBrand(b: Brand | null | undefined): boolean {
  return !!b && (b.colors.length > 0 || !!b.fonts.trim() || !!b.logoUrl.trim() || !!b.notes.trim());
}

/** "#AbC" / "abcdef" / "#aabbccdd" → "#AABBCC"; anything else → null. */
export function normalizeHex(v: string): string | null {
  const m = String(v || "").trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return "#" + h.slice(0, 6).toUpperCase();
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return ("#" + c(r) + c(g) + c(b)).toUpperCase();
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 0 = grey, 1 = fully saturated. */
export function saturation(hex: string): number {
  const [r, g, b] = rgb(hex).map((x) => x / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const l = (max + min) / 2;
  return (max - min) / (1 - Math.abs(2 * l - 1));
}
export function lightness(hex: string): number {
  const [r, g, b] = rgb(hex).map((x) => x / 255);
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}
/** Neutral = black, white or a grey: kept apart from the brand colours. */
export function isNeutral(hex: string): boolean {
  return saturation(hex) < 0.12 || lightness(hex) > 0.96 || lightness(hex) < 0.06;
}

function sanitize(c: Partial<BrandColor>): BrandColor | null {
  const hex = normalizeHex(String(c.hex || ""));
  if (!hex) return null;
  return { name: String(c.name || "").trim().slice(0, 60) || hex, hex, role: String(c.role || "").trim().slice(0, 80) };
}

/** Clean a brand read from storage or from a request. */
export function cleanBrand(b: Partial<Brand> | null | undefined): Brand {
  const seen = new Set<string>();
  const colors: BrandColor[] = [];
  for (const c of Array.isArray(b?.colors) ? b!.colors : []) {
    const s = sanitize(c || {});
    if (!s || seen.has(s.hex)) continue;
    seen.add(s.hex);
    colors.push(s);
  }
  const logo = String(b?.logoUrl || "").trim();
  return {
    colors: colors.slice(0, 12),
    fonts: String(b?.fonts || "").slice(0, 600),
    logoUrl: /^https?:\/\//i.test(logo) ? logo.slice(0, 600) : "",
    notes: String(b?.notes || "").slice(0, 4000),
    source: b?.source === "ai" ? "ai" : "manual",
    from: b?.from ? String(b.from).slice(0, 200) : null,
    updatedAt: b?.updatedAt ? String(b.updatedAt) : null,
  };
}

// ── From the website ─────────────────────────────────────────────────────────

export type SiteFindings = {
  themeColor: string | null;
  /** Brand-looking colours, most used first, with how often they appear. */
  colors: Array<{ hex: string; count: number }>;
  neutrals: Array<{ hex: string; count: number }>;
  /** CSS custom properties that look like brand colours (--primary: #…). */
  namedVars: Array<{ name: string; hex: string }>;
  fonts: string[];
  logoUrl: string | null;
  title: string | null;
  description: string | null;
  stylesheets: string[];
};

const GENERIC_FONTS = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "inherit", "initial", "unset", "-apple-system", "blinkmacsystemfont", "segoe ui", "roboto", "helvetica neue", "helvetica", "arial", "apple color emoji", "segoe ui emoji", "segoe ui symbol", "noto color emoji", "ui-sans-serif", "ui-serif", "ui-monospace", "var", "times new roman", "times", "courier new", "courier", "sfmono-regular", "menlo", "monaco", "consolas", "liberation mono", "fontawesome", "font awesome 5 free", "font awesome 6 free", "dashicons", "icomoon", "swiper-icons", "eicons"]);

function abs(url: string, base: string): string | null {
  try {
    return new URL(url.replace(/&amp;/g, "&"), base).toString();
  } catch {
    return null;
  }
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[2] ?? m[3] ?? m[4] ?? "").trim() : null;
}

/** The stylesheet URLs a page links to (first ones only: the theme, not plugins). */
export function stylesheetsOf(html: string, base: string, max = 4): string[] {
  const out: string[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const rel = (attr(tag, "rel") || "").toLowerCase();
    const href = attr(tag, "href");
    if (!href || !rel.includes("stylesheet")) continue;
    if (/fonts\.googleapis|font-awesome|fontawesome|bootstrap(\.min)?\.css|jquery|wp-includes|elementor\/assets\/lib|cookie|gdpr/i.test(href)) continue;
    const u = abs(href, base);
    if (u && !out.includes(u)) out.push(u);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * What the site says about its look: colours used in its CSS (and inline
 * styles), CSS variables with brand-ish names, fonts, the logo, the
 * theme-color. Counting is by occurrence — the most used colours first.
 */
export function extractFromSite(html: string, cssTexts: string[], baseUrl: string): SiteFindings {
  const head = html.slice(0, 400000);
  const styleBlocks = (head.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || []).join("\n");
  const inline = (head.match(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi) || []).join("\n");
  const css = [styleBlocks, inline, ...cssTexts.map((c) => c.slice(0, 600000))].join("\n");

  const counts = new Map<string, number>();
  const add = (hex: string | null, w = 1) => { if (hex) counts.set(hex, (counts.get(hex) || 0) + w); };
  for (const m of css.matchAll(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})\b/gi)) add(normalizeHex(m[1]));
  for (const m of css.matchAll(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([\d.]+%?))?\s*\)/gi)) {
    const alpha = m[4] ? (m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4])) : 1;
    if (alpha < 0.5) continue;
    add(rgbToHex(+m[1], +m[2], +m[3]));
  }

  const namedVars: Array<{ name: string; hex: string }> = [];
  for (const m of css.matchAll(/--([a-z0-9_-]*(?:primary|secondary|accent|brand|main|highlight|theme)[a-z0-9_-]*)\s*:\s*(#[0-9a-f]{3,8}\b|rgba?\([^)]*\))/gi)) {
    let hex = normalizeHex(m[2]);
    if (!hex) {
      const r = m[2].match(/(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/);
      if (r) hex = rgbToHex(+r[1], +r[2], +r[3]);
    }
    if (!hex || namedVars.some((v) => v.name === m[1])) continue;
    namedVars.push({ name: m[1], hex });
    add(hex, 5); // a colour the theme names "primary" weighs more than one stray use
  }

  let themeColor: string | null = null;
  for (const tag of head.match(/<meta\b[^>]*>/gi) || []) {
    if ((attr(tag, "name") || "").toLowerCase() === "theme-color") {
      const v = attr(tag, "content") || "";
      themeColor = normalizeHex(v);
      if (!themeColor) {
        const r = v.match(/(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/);
        if (r) themeColor = rgbToHex(+r[1], +r[2], +r[3]);
      }
      add(themeColor, 8);
    }
  }

  const all = [...counts.entries()].map(([hex, count]) => ({ hex, count })).sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex));
  const colors = all.filter((c) => !isNeutral(c.hex)).slice(0, 10);
  const neutrals = all.filter((c) => isNeutral(c.hex)).slice(0, 4);

  // Fonts: Google Fonts links + font-family declarations, most used first.
  const fontCount = new Map<string, number>();
  const addFont = (f: string, w = 1) => {
    const name = f.replace(/["']/g, "").replace(/!important/i, "").trim();
    if (!name || name.length > 40 || /^var\(|^\d/.test(name) || GENERIC_FONTS.has(name.toLowerCase())) return;
    fontCount.set(name, (fontCount.get(name) || 0) + w);
  };
  for (const tag of head.match(/<link\b[^>]*>/gi) || []) {
    const href = (attr(tag, "href") || "").replace(/&amp;/g, "&");
    if (!/fonts\.googleapis\.com/i.test(href)) continue;
    for (const m of href.matchAll(/family=([^&:]+)/g)) addFont(decodeURIComponent(m[1].replace(/\+/g, " ")), 10);
  }
  for (const m of css.matchAll(/font-family\s*:\s*([^;}"]+(?:"[^"]*"[^;}"]*)*)/gi)) {
    for (const f of m[1].split(",")) addFont(f);
  }
  const fonts = [...fontCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([f]) => f);

  // Logo: an <img> named "logo" first, then the apple-touch-icon / og:image.
  let logoUrl: string | null = null;
  for (const tag of head.match(/<img\b[^>]*>/gi) || []) {
    const src = attr(tag, "src") || attr(tag, "data-src") || "";
    if (!src || src.startsWith("data:")) continue;
    if (/logo/i.test(`${src} ${attr(tag, "alt") || ""} ${attr(tag, "class") || ""} ${attr(tag, "id") || ""}`)) { logoUrl = abs(src, baseUrl); break; }
  }
  if (!logoUrl) {
    for (const tag of head.match(/<link\b[^>]*>/gi) || []) {
      if (/apple-touch-icon/i.test(attr(tag, "rel") || "") && attr(tag, "href")) { logoUrl = abs(attr(tag, "href")!, baseUrl); break; }
    }
  }
  let ogImage: string | null = null, description: string | null = null;
  for (const tag of head.match(/<meta\b[^>]*>/gi) || []) {
    const p = (attr(tag, "property") || attr(tag, "name") || "").toLowerCase();
    if (p === "og:image" && !ogImage) ogImage = abs(attr(tag, "content") || "", baseUrl);
    if ((p === "description" || p === "og:description") && !description) description = (attr(tag, "content") || "").slice(0, 400) || null;
  }
  if (!logoUrl) logoUrl = ogImage;
  const title = (head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim().slice(0, 200) || null;

  return { themeColor, colors, neutrals, namedVars: namedVars.slice(0, 10), fonts, logoUrl, title, description, stylesheets: stylesheetsOf(html, baseUrl) };
}

/** A starting brand from the site alone (used when Intelligence cannot answer). */
export function brandFromFindings(f: SiteFindings, from: string, now = new Date().toISOString()): Brand {
  const colors: BrandColor[] = [];
  const push = (hex: string, name: string, role: string) => { if (!colors.some((c) => c.hex === hex)) colors.push({ hex, name, role }); };
  if (f.themeColor && !isNeutral(f.themeColor)) push(f.themeColor, "Theme colour", "Primary (site theme colour)");
  for (const v of f.namedVars) if (!isNeutral(v.hex)) push(v.hex, v.name.replace(/[-_]+/g, " ").trim(), "From the site's CSS");
  f.colors.forEach((c, i) => push(c.hex, i === 0 ? "Main colour" : `Colour ${i + 1}`, i === 0 ? "Most used on the site" : "Used on the site"));
  for (const n of f.neutrals.slice(0, 2)) push(n.hex, lightness(n.hex) > 0.5 ? "Light neutral" : "Dark neutral", "Text / background");
  return cleanBrand({ colors: colors.slice(0, 8), fonts: f.fonts.join(", "), logoUrl: f.logoUrl || "", notes: "", source: "ai", from, updatedAt: now });
}

/** The findings as a few lines for the AI. */
export function findingsForPrompt(f: SiteFindings): string {
  return [
    f.title ? `Site title: ${f.title}` : "",
    f.description ? `Site description: ${f.description}` : "",
    f.themeColor ? `theme-color meta: ${f.themeColor}` : "",
    f.namedVars.length ? `CSS variables: ${f.namedVars.map((v) => `--${v.name}: ${v.hex}`).join("; ")}` : "",
    f.colors.length ? `Colours used most (hex × uses): ${f.colors.map((c) => `${c.hex}×${c.count}`).join(", ")}` : "No saturated colour found in the CSS.",
    f.neutrals.length ? `Neutrals: ${f.neutrals.map((c) => `${c.hex}×${c.count}`).join(", ")}` : "",
    f.fonts.length ? `Fonts: ${f.fonts.join(", ")}` : "No web font found.",
    f.logoUrl ? `Logo: ${f.logoUrl}` : "",
  ].filter(Boolean).join("\n");
}

// ── Text form (validation) ───────────────────────────────────────────────────

/** The brand as readable text — what the reviewer validates. */
export function brandText(b: Brand): string {
  if (!hasBrand(b)) return "";
  const out: string[] = [];
  if (b.colors.length) {
    out.push("Colours:");
    for (const c of b.colors) out.push(`- ${c.name}: ${c.hex}${c.role ? ` (${c.role})` : ""}`);
  }
  if (b.fonts.trim()) out.push(`Fonts: ${b.fonts.trim()}`);
  if (b.logoUrl.trim()) out.push(`Logo: ${b.logoUrl.trim()}`);
  if (b.notes.trim()) out.push(`Guidelines:\n${b.notes.trim()}`);
  if (b.from) out.push(`Source: ${b.from}`);
  return out.join("\n");
}

/** Read the text form back (the internal reviewer may correct it on the review page). */
export function parseBrandText(text: string, prev: Brand, now = new Date().toISOString()): Brand {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const colors: BrandColor[] = [];
  let fonts = "", logoUrl = "", from = prev.from;
  const notes: string[] = [];
  let mode: "none" | "colors" | "notes" = "none";
  for (const raw of lines) {
    const line = raw.trim();
    let m: RegExpMatchArray | null;
    if (/^colou?rs\s*:?\s*$/i.test(line)) { mode = "colors"; continue; }
    if ((m = line.match(/^fonts?\s*:\s*(.*)$/i))) { fonts = m[1]; mode = "none"; continue; }
    if ((m = line.match(/^logo\s*:\s*(.*)$/i))) { logoUrl = m[1]; mode = "none"; continue; }
    if ((m = line.match(/^source\s*:\s*(.*)$/i))) { from = m[1] || null; mode = "none"; continue; }
    if ((m = line.match(/^guidelines\s*:\s*(.*)$/i))) { mode = "notes"; if (m[1]) notes.push(m[1]); continue; }
    if (mode === "notes") { notes.push(raw); continue; }
    // A colour line: "- Navy: #0A2342 (Primary)" — also accepted outside the Colours block.
    if ((m = line.match(/^[-*•]?\s*(.*?)\s*[:=–-]?\s*(#[0-9a-f]{3,8})\b\s*(?:\((.*)\))?\s*$/i))) {
      const c = sanitize({ name: m[1].replace(/[:=–-]\s*$/, ""), hex: m[2], role: m[3] || "" });
      if (c) { colors.push(c); continue; }
    }
    if (line) notes.push(raw);
  }
  return cleanBrand({ colors, fonts, logoUrl, notes: notes.join("\n").trim(), source: "manual", from, updatedAt: now });
}

// ── What the writers and the picture model get ───────────────────────────────

export function brandForPrompt(b: Brand): string {
  if (!hasBrand(b)) return "";
  const out = ["BRAND IDENTITY (respect it in wording and in any visual idea):"];
  if (b.colors.length) out.push(`Colours: ${b.colors.map((c) => `${c.name} ${c.hex}${c.role ? ` (${c.role})` : ""}`).join("; ")}`);
  if (b.fonts.trim()) out.push(`Fonts: ${b.fonts.trim()}`);
  if (b.notes.trim()) out.push(`Guidelines: ${b.notes.trim().slice(0, 900)}`);
  return out.join("\n");
}

/** A short colour hint for the picture model, brand colours only (no neutrals). */
export function paletteForImage(b: Brand | null | undefined): string {
  if (!b) return "";
  const main = b.colors.filter((c) => !isNeutral(c.hex)).slice(0, 3);
  if (!main.length) return "";
  return `Colour palette with subtle accents of ${main.map((c) => `${c.name.toLowerCase()} (${c.hex})`).join(", ")}`;
}
