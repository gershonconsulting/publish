/**
 * v0.14.0 — when a personal LinkedIn connection needs a new "Allow" (pure, tested).
 * With a refresh token the access token is renewed automatically until the
 * refresh token itself expires; without one, the access token's date is the end.
 */
export const LI_REMIND_DAYS = 10;
const DAY = 86400000;

export function liEffectiveExpiry(c: { refreshToken: string | null; expiresAt: string; refreshExpiresAt: string | null }): string {
  return c.refreshToken && c.refreshExpiresAt ? c.refreshExpiresAt : c.expiresAt;
}

/** "ok" | "soon" (within LI_REMIND_DAYS) | "expired". */
export function liExpiryState(expiry: string, now = Date.now()): "ok" | "soon" | "expired" {
  const t = Date.parse(expiry);
  if (!Number.isFinite(t)) return "expired";
  if (t <= now) return "expired";
  return t - now <= LI_REMIND_DAYS * DAY ? "soon" : "ok";
}

/** Send a reminder? Once per expiry date and state (one "soon", one "expired"). */
export function liShouldRemind(expiry: string, lastStamp: string | null, now = Date.now()): { send: boolean; stamp: string; state: "soon" | "expired" | "ok" } {
  const state = liExpiryState(expiry, now);
  const stamp = `${expiry}|${state}`;
  return { send: state !== "ok" && lastStamp !== stamp, stamp, state };
}
