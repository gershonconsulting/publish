"use client";

import { useEffect, useState } from "react";

/**
 * "This computer" (v0.9.0 Settings) — per COMPUTER, not per account, exactly
 * like Social's Collecting session (lib/collecting-mode.ts).
 *
 * Publish is opened from several computers. Some run the Publish extension and
 * publish; some only view (a laptop, a phone, a computer whose extension is
 * not working). localStorage is per browser profile == per computer:
 *
 *   publish_computer_mode  "on" (default) — this computer publishes: the
 *                          extension is expected here and its absence is shown.
 *                          "off" — viewing only: no "not installed" notice here.
 *   publish_computer_name  the name typed on this computer, until the
 *                          extension (0.2.1+) lets us name it for everyone.
 */
const MODE_KEY = "publish_computer_mode";
const NAME_KEY = "publish_computer_name";
const EVT = "publish-computer-changed";

export function readPublishes(): boolean {
  try { return window.localStorage.getItem(MODE_KEY) !== "off"; } catch { return true; }
}
export function writePublishes(on: boolean): void {
  try { window.localStorage.setItem(MODE_KEY, on ? "on" : "off"); } catch {}
  try { window.dispatchEvent(new CustomEvent(EVT)); } catch {}
}
export function readLocalName(): string {
  try { return window.localStorage.getItem(NAME_KEY) || ""; } catch { return ""; }
}
export function writeLocalName(name: string): void {
  try { if (name.trim()) window.localStorage.setItem(NAME_KEY, name.trim().slice(0, 60)); else window.localStorage.removeItem(NAME_KEY); } catch {}
  try { window.dispatchEvent(new CustomEvent(EVT)); } catch {}
}

export function usePublishesHere(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const sync = () => setOn(readPublishes());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener("storage", sync); };
  }, []);
  return [on, (v: boolean) => { writePublishes(v); setOn(v); }];
}
