"use client";

/**
 * Publish extension check — on EVERY page (shared layout), v0.6.0.
 *
 * Pings the Publish extension through its own bridge (PUBLISH_PING →
 * PUBLISH_PONG { version }; it also announces PUBLISH_HELLO on load). Social's
 * extension speaks GERSHONAI_* and is ignored here.
 *   - installed version < EXTENSION_LATEST → RED banner with the update steps
 *   - no answer → a quiet "not installed in this browser" notice
 * The version seen is reported to /api/extension/seen (once per version per day).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertOctagon, Puzzle } from "lucide-react";
import { EXTENSION_LATEST, EXTENSION_ZIP_NAME, EXTENSION_ZIP_URL } from "@/lib/extension-version";
import { usePublishesHere } from "@/lib/computer-mode";

const THROTTLE_KEY = "publish:ext-seen-reported";
const DISMISS_KEY = "publish:ext-missing-dismissed";

export function semverLt(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0);
  }
  return false;
}

function report(version: string) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    if (window.localStorage.getItem(THROTTLE_KEY) === `${version}|${today}`) return;
    void fetch("/api/extension/seen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version }),
      keepalive: true,
    }).then((r) => { if (r.ok) window.localStorage.setItem(THROTTLE_KEY, `${version}|${today}`); }).catch(() => {});
  } catch {
    /* best effort */
  }
}

/** Shared hook: the Publish extension version in this browser, "missing", or null while checking. */
export function usePublishExtension(): string | "missing" | null {
  return usePublishExtensionInfo().version;
}

/**
 * v0.9.0: version AND this Chrome's publishing id (extension 0.2.1+ sends it;
 * older ones answer without it → browserId null).
 */
export function usePublishExtensionInfo(): { version: string | "missing" | null; browserId: string | null } {
  const [v, setV] = useState<string | "missing" | null>(null);
  const [bid, setBid] = useState<string | null>(null);
  useEffect(() => {
    let found = false;
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin) return;
      const d = e.data;
      if (!d || typeof d !== "object") return;
      if ((d.type === "PUBLISH_PONG" || d.type === "PUBLISH_HELLO") && typeof d.version === "string") {
        found = true;
        setV(d.version);
        if (typeof d.browserId === "string" && /^[A-Za-z0-9_-]{6,40}$/.test(d.browserId)) setBid(d.browserId);
      }
    };
    window.addEventListener("message", onMsg);
    window.postMessage({ type: "PUBLISH_PING", requestId: Math.random().toString(36).slice(2) }, window.location.origin);
    const t1 = setTimeout(() => { if (!found) window.postMessage({ type: "PUBLISH_PING" }, window.location.origin); }, 1200);
    const t2 = setTimeout(() => { if (!found) setV("missing"); }, 3000);
    return () => { window.removeEventListener("message", onMsg); clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return { version: v, browserId: bid };
}

export function PublishExtensionBanner() {
  const v = usePublishExtension();
  // v0.9.0: a viewing-only computer (Settings → This computer) gets no "not installed" notice.
  const [publishesHere] = usePublishesHere();
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try { setDismissed(window.localStorage.getItem(DISMISS_KEY) === new Date().toISOString().slice(0, 10)); } catch { setDismissed(false); }
  }, []);
  useEffect(() => { if (v && v !== "missing") report(v); }, [v]);

  if (!v) return null;
  if (v !== "missing" && semverLt(v, EXTENSION_LATEST)) {
    return (
      <div className="mb-5 rounded-xl bg-red-600 text-white px-4 py-3 flex flex-wrap items-center gap-3" role="alert">
        <AlertOctagon size={18} className="flex-shrink-0" />
        <div className="flex-1 min-w-[240px] text-sm">
          <b>The Publish extension in this Chrome is out of date — v{v} installed, v{EXTENSION_LATEST} is the latest.</b>{" "}
          Scheduled posts may not go out correctly until it is updated.
        </div>
        <Link href="/extension" className="text-sm font-semibold bg-white text-red-700 rounded-md px-3 py-1.5 hover:bg-red-50">How to update</Link>
        <a href={EXTENSION_ZIP_URL} download={EXTENSION_ZIP_NAME} className="text-sm font-semibold underline">Download v{EXTENSION_LATEST}</a>
      </div>
    );
  }
  if (v === "missing" && !dismissed && publishesHere) {
    return (
      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 px-4 py-2.5 flex flex-wrap items-center gap-3 text-sm">
        <Puzzle size={16} className="flex-shrink-0" />
        <div className="flex-1 min-w-[240px]">
          The Publish extension is not installed in this Chrome. Posts go out only from a Chrome that has it (this one does not need it unless it is a publishing Chrome).
        </div>
        <Link href="/extension" className="font-semibold underline">Install</Link>
        <Link href="/settings#this-computer" className="font-semibold underline">This computer only views</Link>
        <button
          onClick={() => { try { window.localStorage.setItem(DISMISS_KEY, new Date().toISOString().slice(0, 10)); } catch {} setDismissed(true); }}
          className="text-xs text-amber-800 hover:underline"
        >
          Hide for today
        </button>
      </div>
    );
  }
  return null;
}
