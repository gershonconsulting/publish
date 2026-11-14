/**
 * v0.18.3 (2026-11-12) — calls from Publish pages to Publish's own API.
 *
 * Why: Aina got `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` while
 * loading Amphasys's November posts (12 went in, then that). Cloudflare had
 * answered with an HTML page (worker over its limits, 5xx, or a security
 * check) instead of Publish's JSON, and the page showed the raw parse error.
 *
 * Now: an answer that isn't JSON, or a 429/5xx, is retried once after a short
 * pause; if it still fails the person gets a sentence saying what to do.
 * The create route is idempotent (same text, same company, same person within
 * 10 minutes → the same post), so a retry never makes a duplicate.
 */

export type ApiResult = { success: boolean; error?: string; [k: string]: unknown };

/** What an answer from the server means for the page. Pure — tested. */
export function readAnswer(status: number, body: string): { kind: "json"; data: ApiResult } | { kind: "retry" | "fail"; error: string } {
  let data: unknown = null;
  try {
    data = JSON.parse(body);
  } catch {
    data = null;
  }
  const isObj = !!data && typeof data === "object" && !Array.isArray(data);
  const transient = status === 429 || status >= 500 || status === 0;
  if (isObj && !transient) return { kind: "json", data: data as ApiResult };
  if (isObj && (data as ApiResult).error && status < 520) {
    // The route answered with its own error (e.g. a 500 with a message): show it.
    return { kind: "json", data: data as ApiResult };
  }
  const html = /^\s*</.test(body);
  if (status === 403 && html) {
    return { kind: "fail", error: "Cloudflare asked this browser for a security check. Reload the page (F5), then click again — nothing was lost." };
  }
  if (transient || html || !isObj) {
    return { kind: "retry", error: `Publish's server didn't answer properly${status ? ` (HTTP ${status})` : ""}. Reload the page (F5), then click again — nothing was lost.` };
  }
  return { kind: "json", data: data as ApiResult };
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch + JSON with one retry on a non-JSON / 429 / 5xx answer. Never throws;
 * always resolves to `{ success, error?, ...data }`.
 */
export async function callApi(url: string, init?: RequestInit, opts: { retries?: number; waitMs?: number } = {}): Promise<ApiResult> {
  const retries = opts.retries ?? 1;
  const waitMs = opts.waitMs ?? 1500;
  let last = "Network error — check the connection, then click again.";
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await pause(waitMs * attempt);
    let status = 0;
    let body = "";
    try {
      const r = await fetch(url, init);
      status = r.status;
      body = await r.text();
    } catch {
      last = "Network error — check the connection, then click again.";
      continue;
    }
    const a = readAnswer(status, body);
    if (a.kind === "json") return a.data;
    last = a.error;
    if (a.kind === "fail") break;
  }
  return { success: false, error: last };
}
