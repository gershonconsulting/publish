/**
 * v0.29.0 — Content folders in the Knowledge Base (Olivier, 2026-11-26:
 * "In knowledge base, we need a link to a folder to upload content from.")
 *
 * Per company, one or more links to the shared folder (Google Drive, Dropbox,
 * OneDrive / SharePoint, Box, any https link) where the client's material
 * lives — brand book, photos, product sheets, past posts. The team opens it
 * from the Knowledge Base to pick what to load into Publish.
 * Stored inside the company's Knowledge Base JSON (OrgSetting kb:<clientId>) —
 * no schema change. Pure helpers (tests/kb-folders.test.mts).
 */
export type ContentFolder = { id: string; label: string; url: string; addedAt: string };

const MAX = 10;

/** A usable https/http link, or null. Adds https:// to a bare "drive.google.com/…". */
export function normalizeFolderUrl(raw: unknown): string | null {
  let s = String(raw ?? "").trim();
  if (!s) return null;
  if (!/^[a-z]+:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString().slice(0, 1000);
  } catch {
    return null;
  }
}

/** Where the folder lives, for the label and icon. */
export function folderProvider(url: string): string {
  let h = "";
  try { h = new URL(url).hostname.toLowerCase(); } catch { return "Link"; }
  if (/(^|\.)drive\.google\.com$|(^|\.)docs\.google\.com$/.test(h)) return "Google Drive";
  if (/(^|\.)dropbox\.com$/.test(h)) return "Dropbox";
  if (/sharepoint\.com$/.test(h)) return "SharePoint";
  if (/(^|\.)onedrive\.live\.com$|(^|\.)1drv\.ms$/.test(h)) return "OneDrive";
  if (/(^|\.)box\.com$/.test(h)) return "Box";
  if (/(^|\.)wetransfer\.com$|(^|\.)we\.tl$/.test(h)) return "WeTransfer";
  if (/(^|\.)notion\.(so|site)$/.test(h)) return "Notion";
  return h.replace(/^www\./, "");
}

function newId(): string {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Clean what was saved or sent: valid links only, no duplicates, at most 10. */
export function cleanFolders(raw: unknown, now = new Date().toISOString()): ContentFolder[] {
  if (!Array.isArray(raw)) return [];
  const out: ContentFolder[] = [];
  const seen = new Set<string>();
  for (const f of raw) {
    if (!f || typeof f !== "object") continue;
    const o = f as Partial<ContentFolder>;
    const url = normalizeFolderUrl(o.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({
      id: typeof o.id === "string" && o.id ? o.id.slice(0, 40) : newId(),
      label: String(o.label ?? "").trim().slice(0, 120) || folderProvider(url) + " folder",
      url,
      addedAt: typeof o.addedAt === "string" && o.addedAt ? o.addedAt : now,
    });
    if (out.length >= MAX) break;
  }
  return out;
}

/** Links that were typed but are not usable — shown to the team before saving. */
export function invalidFolders(raw: Array<{ url?: string }>): number {
  return raw.filter((f) => String(f.url ?? "").trim() && !normalizeFolderUrl(f.url)).length;
}
