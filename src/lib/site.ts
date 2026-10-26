/**
 * The address of this app — ONE place. Publish lives at publish.gershon.ai.
 * Split out of Social on 2026-10-26 (see docs/THREE-PLATFORM-SPLIT.md).
 */
export const SITE_HOST = "publish.gershon.ai";
export const SITE_ORIGIN = `https://${SITE_HOST}`;

/** No legacy hosts: this app has always lived on its own domain. */
export const LEGACY_HOSTS: string[] = [];

export function siteUrl(): string {
  const env = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  if (env && env.includes(SITE_HOST)) return env;
  return SITE_ORIGIN;
}
