"use client";
/**
 * v0.27.0 — "Let the client choose": the team loads up to 3 pictures; the client
 * picks one on the review page and it becomes the post's picture.
 */
import { useEffect, useState } from "react";
import { callApi } from "@/lib/api-call";
import { prepareImage } from "@/components/publishing/shared";

type C = { id: string; label: string; src: string };

export function ClientPictureChoices({ itemId, disabled, reloadKey, onChanged }: { itemId: string; disabled?: boolean; reloadKey?: number; onChanged: () => void }) {
  const [list, setList] = useState<C[]>([]);
  const [max, setMax] = useState(3);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const url = `/api/publishing/content/${itemId}/picture-choices`;

  async function load() {
    const j = await callApi(url, { cache: "no-store" });
    if (j.success) {
      const d = j.data as { max: number; choices: C[] };
      setList(d.choices);
      setMax(d.max);
    }
  }
  useEffect(() => { load(); }, [itemId, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(files: File[]) {
    setBusy(true);
    setErr(null);
    for (const f of files.slice(0, max - list.length)) {
      try {
        const p = await prepareImage(f);
        const j = await callApi(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataB64: p.dataB64, mime: p.mime, width: p.width, height: p.height, label: f.name }) });
        if (!j.success) { setErr((j.error as string) || "Upload failed."); break; }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not read the picture.");
        break;
      }
    }
    await load();
    onChanged();
    setBusy(false);
  }

  async function remove(id: string | null) {
    setBusy(true);
    await callApi(id ? `${url}?choice=${id}` : `${url}?all=1`, { method: "DELETE" });
    await load();
    onChanged();
    setBusy(false);
  }

  return (
    <div className="mt-2 border border-violet-200 rounded-lg p-2 bg-violet-50/50">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium text-gray-700">
          Let the client choose — load up to {max} pictures; the client picks one when validating
        </div>
        {list.length > 0 && !disabled && (
          <button type="button" onClick={() => remove(null)} disabled={busy} className="text-[11px] text-gray-500 hover:underline">Remove all</button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {list.map((c, i) => (
          <div key={c.id} className="relative w-24">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.src} alt="" className="w-24 h-24 object-cover rounded-lg border border-gray-200" />
            <div className="text-[10px] text-gray-500 truncate">{i + 1}. {c.label}</div>
            {!disabled && (
              <button onClick={() => remove(c.id)} disabled={busy} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-900 text-white text-xs leading-5" aria-label="Remove">×</button>
            )}
          </div>
        ))}
        {!disabled && list.length < max && (
          <label className={`flex flex-col items-center justify-center w-24 h-24 rounded-lg border-2 border-dashed text-[11px] text-center leading-tight ${busy ? "border-gray-200 text-gray-300" : "border-violet-300 text-violet-700 hover:border-violet-500 cursor-pointer"}`}>
            <span className="text-xl leading-none">+</span>
            {busy ? "Loading…" : `Load picture${max - list.length > 1 ? "s" : ""} (${list.length}/${max})`}
            <input type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp,image/heic" disabled={busy} className="hidden"
              onChange={(e) => { add(Array.from(e.target.files || [])); e.target.value = ""; }} />
          </label>
        )}
      </div>
      {list.length > 0 && <div className="text-[11px] text-violet-700 mt-1">The client sees these {list.length} on the review link and must pick one before approving.</div>}
      {err && <div className="text-[11px] text-red-600 mt-1">{err}</div>}
    </div>
  );
}
