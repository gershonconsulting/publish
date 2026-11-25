"use client";
/**
 * v0.26.0 — "Choose the picture": 3 options, real photos first, AI only when no
 * real photo matched (Olivier 2026-11-25). The team picks one before sending
 * the post for validation.
 */
import { useState } from "react";
import { callApi } from "@/lib/api-call";

type Opt = { id: string; label: string; thumb: string; title: string; credit: string; license: string; page: string; ai: boolean };

export function PictureOptions({ itemId, hasPicture, disabled, onChosen }: { itemId: string; hasPicture: boolean; disabled?: boolean; onChosen: () => void }) {
  const [open, setOpen] = useState(!hasPicture);
  const [opts, setOpts] = useState<Opt[] | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load(params = "") {
    setBusy(true);
    setErr(null);
    const j = await callApi(`/api/publishing/content/${itemId}/picture-options${params}`, { cache: "no-store" });
    if (j.success) {
      const d = j.data as { query: string; options: Opt[] };
      setOpts(d.options);
      setQuery(d.query);
      if (!d.options.length) setErr("No picture found — try other search words.");
    } else setErr((j.error as string) || "Could not find pictures.");
    setBusy(false);
  }

  async function choose(o: Opt) {
    setBusy(true);
    setErr(null);
    const j = await callApi(`/api/publishing/content/${itemId}/picture-options`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ optionId: o.id }) });
    setBusy(false);
    if (!j.success) return setErr((j.error as string) || "Could not use this picture.");
    setOpen(false);
    onChosen();
  }

  if (!open) {
    return (
      <button type="button" disabled={disabled} onClick={() => { setOpen(true); if (!opts) load(); }} className="text-[11px] text-blue-700 hover:underline mt-1">
        {hasPicture ? "Choose another picture (3 options, real photos first)" : "Choose the picture (3 options)"}
      </button>
    );
  }
  if (!opts && !busy && !err) load();

  return (
    <div className="mt-2 border border-gray-200 rounded-lg p-2 bg-gray-50">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-[11px] font-medium text-gray-700">Pick one of these 3 — real photos first, AI only when nothing matched</div>
        {hasPicture && <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-gray-500 hover:underline">Close</button>}
      </div>
      <form
        className="flex gap-1 mb-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) load(`?q=${encodeURIComponent(query.trim())}`);
        }}
      >
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search words, e.g. retail shelves" className="flex-1 text-xs border border-gray-300 rounded px-2 py-1" />
        <button type="submit" disabled={busy || disabled} className="text-xs px-2 py-1 rounded border border-gray-300 bg-white">Search</button>
        <button type="button" disabled={busy || disabled} onClick={() => load("?refresh=1")} className="text-xs px-2 py-1 rounded border border-gray-300 bg-white">3 others</button>
      </form>
      {busy && <div className="text-xs text-gray-500 py-4 text-center">Finding pictures…</div>}
      {!busy && opts && (
        <div className="grid grid-cols-3 gap-2">
          {opts.map((o, i) => (
            <div key={o.id} className="flex flex-col">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={o.thumb} alt={o.title} className="w-full aspect-[4/3] object-cover rounded border border-gray-200 bg-white" />
              <div className={`text-[10px] mt-1 ${o.ai ? "text-amber-700" : "text-green-700"}`}>{i + 1}. {o.label}</div>
              {!o.ai && (
                <a href={o.page} target="_blank" rel="noreferrer" className="text-[10px] text-gray-500 truncate hover:underline">
                  {o.credit || "source"}{o.license ? ` · ${o.license}` : ""}
                </a>
              )}
              <button type="button" disabled={busy || disabled} onClick={() => choose(o)} className="mt-1 text-xs px-2 py-1 rounded bg-gray-900 text-white disabled:opacity-40">
                Use this one
              </button>
            </div>
          ))}
        </div>
      )}
      {err && <div className="text-[11px] text-red-600 mt-1">{err}</div>}
    </div>
  );
}
