/**
 * v0.23.1 — the monthly client email goes out ONCE per client per month
 * (pure logic, unit-tested in tests/monthly-once.test.mts; the database side
 * is lib/monthly-once-db.ts).
 *
 * Resend audit 2026-11-20 (Altavia, arouleau@altavia.co), all with the subject
 * "Gershon Consulting Publish - Altavia (Alexandre) - November 2026":
 *   2026-11-17 19:53:13Z  PUB-103 Autopilot month to validate (10 posts)
 *   2026-11-18 18:01:34Z  PUB-105 new version of a post (after the team's comment)
 *   2026-11-18 18:24:51Z  PUB-101 the SAME post, same version 4, again
 *   2026-11-18 19:23:48Z  PUB-103 Autopilot month to validate AGAIN ("3 posts", list of 4)
 *
 * Root causes:
 *  1. autopilot.ts submitMonth() ("Once per month", said its comment) had no
 *     "already sent" marker and a random Resend Idempotency-Key. It runs on every
 *     Autopilot step once the month is complete; when Autopilot later wrote
 *     replacement drafts for the month (rewrites, deleted/moved posts), the next
 *     step sent the whole-month PUB-103 again.
 *  2. A post announced to the client as a new version (PUB-105, comments route)
 *     was announced again as "new post to review" (PUB-101) when it was sent for
 *     review without a change — nothing remembered that this version was already
 *     in the client's inbox.
 *
 * Guards:
 *  - A durable claim per (client, YYYY-MM) in org_settings
 *    `monthly_sent:<YYYY-MM>:<clientId>`, taken atomically BEFORE sending
 *    (unique key, so two concurrent steps cannot both send), confirmed after
 *    Resend accepted the email, released when the send failed (next step retries).
 *  - The Resend Idempotency-Key "publish-monthly-<clientId>-<YYYY-MM>" on that
 *    email, so even a lost marker cannot deliver it twice within Resend's 24 h.
 *  - A per-post-version marker `client_announced:<itemId>@<version>#<pictures>`:
 *    PUB-101 / PUB-105 for a version (same text AND same pictures) the client was
 *    already told about are skipped.
 */

export const MONTHLY_PREFIX = "monthly_sent:";
export const ANNOUNCED_PREFIX = "client_announced:";
/** A claim whose send never finished (crash, timeout) can be taken over after this. */
export const STALE_CLAIM_MS = 15 * 60 * 1000;

export function isMonthKey(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

/** org_settings key of the "monthly email sent" marker. */
export function monthlySentKey(clientId: string, monthKey: string): string {
  return `${MONTHLY_PREFIX}${monthKey}:${clientId}`;
}

/** Resend Idempotency-Key of the monthly client email (max 256 chars). */
export function monthlyIdempotencyKey(clientId: string, monthKey: string): string {
  return `publish-monthly-${clientId}-${monthKey}`.slice(0, 256);
}

/**
 * org_settings key of "the client was told about this post version". `pictures`
 * is a fingerprint of the post's media ids (pictureSig), so a new picture on the
 * same text version is still announced.
 */
export function announcedKey(itemId: string, version: number, pictures = ""): string {
  return `${ANNOUNCED_PREFIX}${itemId}@${version}${pictures ? `#${pictures}` : ""}`;
}

/** Order-independent fingerprint of a post's media ids ("" when it has none). */
export function pictureSig(mediaIds: Array<string | null | undefined>): string {
  const ids = Array.from(new Set(mediaIds.filter((x): x is string => !!x))).sort();
  if (!ids.length) return "";
  let h = 0x811c9dc5;
  const s = ids.join(",");
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/** Stored values: "pending:<ms>" while sending, "sent:<ms>" once Resend accepted it. */
export function claimValue(state: "pending" | "sent", now: number): string {
  return `${state}:${now}`;
}

/** True when an existing marker blocks a new send (sent, or a fresh pending claim). */
export function markerBlocks(value: string | null | undefined, now: number, staleMs = STALE_CLAIM_MS): boolean {
  if (!value) return false;
  const [state, ms] = value.split(":");
  if (state === "sent") return true;
  if (state === "pending") {
    const at = Number(ms);
    return Number.isFinite(at) && now - at < staleMs;
  }
  return true; // unknown value: be safe, never re-send to a client
}

/** Storage used by sendOncePerMonth (org_settings in production, a Map in tests). */
export interface OnceStore {
  /** Atomically create the marker with `value`; false when it already exists and still blocks. */
  claim(key: string, value: string, now: number): Promise<boolean>;
  /** Overwrite the marker. */
  confirm(key: string, value: string): Promise<void>;
  /** Remove the marker (the send failed → the next run may try again). */
  release(key: string): Promise<void>;
}

export type OnceResult = "sent" | "already_sent" | "failed";

/**
 * Sends the monthly email of one client at most once for `monthKey`.
 * `send` gets the deterministic Idempotency-Key and returns true when Resend accepted it.
 */
export async function sendOncePerMonth(
  store: OnceStore,
  clientId: string,
  monthKey: string,
  send: (idempotencyKey: string) => Promise<boolean>,
  now = Date.now(),
): Promise<OnceResult> {
  if (!clientId || !isMonthKey(monthKey)) throw new Error(`sendOncePerMonth: bad client/month "${clientId}"/"${monthKey}"`);
  const key = monthlySentKey(clientId, monthKey);
  if (!(await store.claim(key, claimValue("pending", now), now))) return "already_sent";
  let ok = false;
  try {
    ok = await send(monthlyIdempotencyKey(clientId, monthKey));
  } catch {
    ok = false;
  }
  if (ok) await store.confirm(key, claimValue("sent", now));
  else await store.release(key);
  return ok ? "sent" : "failed";
}

/** In-memory store with the same claim semantics as the database one (tests, previews). */
export function memoryStore(map = new Map<string, string>()): OnceStore & { map: Map<string, string> } {
  return {
    map,
    async claim(key, value, now) {
      if (markerBlocks(map.get(key), now)) return false;
      map.set(key, value);
      return true;
    },
    async confirm(key, value) {
      map.set(key, value);
    },
    async release(key) {
      map.delete(key);
    },
  };
}
