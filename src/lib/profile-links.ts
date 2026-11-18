/** v0.19.2 — Connections cards: every account shown is a clickable link to the real profile. */
export function xProfileUrl(handle: string): string {
  return `https://x.com/${encodeURIComponent(handle.trim().replace(/^@/, ""))}`;
}
export function liProfileUrl(slug: string): string {
  return `https://www.linkedin.com/in/${encodeURIComponent(slug.trim().replace(/^in\//, "").replace(/\/+$/, ""))}/`;
}
