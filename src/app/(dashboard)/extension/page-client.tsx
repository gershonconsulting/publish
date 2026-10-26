"use client";

/**
 * /extension — Publish by Gershon.AI — LinkedIn & X Publisher (v0.6.0).
 *
 * Both install routes side by side, as on every Gershon app that ships an
 * extension: (a) download the zip from this domain, (b) Load unpacked from the
 * folder on Olivier's computer. Then: is it installed in THIS Chrome, which
 * publishing Chromes have checked in (version, last seen, networks signed in),
 * and the last deliveries.
 */

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, Download, FolderOpen, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Card, Dot, NetBadge, Unavailable, ago } from "@/components/publish/ui";
import { semverLt, usePublishExtension } from "@/components/layout/publish-extension-banner";
import { EXTENSION_LATEST, EXTENSION_NAME, EXTENSION_UNPACKED_FOLDER, EXTENSION_ZIP_NAME, EXTENSION_ZIP_URL } from "@/lib/extension-version";
import type { BrowserView } from "@/lib/publish-dashboard";

type Delivery = { id: string; company: string; clientId: string | null; platform: string; status: string; at: string; postUrl: string | null; verified: boolean; verifiedVia: string | null; error: string | null };
type Status = {
  browsers: BrowserView[] | null; browsersError?: string;
  seen?: { version: string; lastSeenAt: string; outOfDate: boolean } | null;
  deliveries: Delivery[] | null; deliveriesError?: string;
};

export function ExtensionClient() {
  const here = usePublishExtension();
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/publishing/extension-status", { cache: "no-store" });
      const j = await r.json();
      if (j?.success) { setSt(j.data); setErr(null); } else setErr(j?.error || "Could not load.");
    } catch { setErr("Could not load."); }
  }, []);
  useEffect(() => { void load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(EXTENSION_UNPACKED_FOLDER); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  const pub = (st?.browsers || []).filter((b) => b.kind === "publish");
  const social = (st?.browsers || []).filter((b) => b.kind === "social");

  return (
    <div>
      <Header
        title="Extension"
        eyebrow="Publish"
        subtitle={`${EXTENSION_NAME} — v${EXTENSION_LATEST}. Picks up due posts from publish.gershon.ai and publishes them on the company LinkedIn page or X account, in its own minimized window. It never collects posts (that is Social's extension).`}
        actions={
          <button onClick={() => void load()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />
      {err && <div className="text-sm rounded-lg px-3 py-2 mb-4 bg-red-50 text-red-800">{err}</div>}

      <div className={`rounded-xl px-4 py-3 mb-5 text-sm font-medium flex items-center gap-2 ${
        here === null ? "bg-gray-100 text-gray-600" : here === "missing" ? "bg-amber-50 border border-amber-200 text-amber-900" : semverLt(here, EXTENSION_LATEST) ? "bg-red-600 text-white" : "bg-emerald-50 border border-emerald-200 text-emerald-900"
      }`}>
        {here === null ? <><Loader2 size={15} className="animate-spin" /> Checking this Chrome…</>
          : here === "missing" ? <><XCircle size={16} /> Not installed in this Chrome.</>
          : semverLt(here, EXTENSION_LATEST) ? <><XCircle size={16} /> This Chrome runs v{here} — out of date, v{EXTENSION_LATEST} is the latest. Update with either route below.</>
          : <><CheckCircle2 size={16} /> Installed in this Chrome — v{here}, up to date.</>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <Card title="A. Download from publish.gershon.ai" subtitle="For any Chrome.">
          <a href={EXTENSION_ZIP_URL} download={EXTENSION_ZIP_NAME} className="inline-flex items-center gap-2 rounded-lg bg-[#D92D20] hover:bg-[#B42318] text-white font-semibold px-4 py-2 text-sm">
            <Download size={16} /> Download {EXTENSION_ZIP_NAME}
          </a>
          <ol className="list-decimal pl-5 mt-3 space-y-1 text-sm text-gray-700">
            <li>Unzip it into a folder you keep.</li>
            <li>Open <code className="text-xs bg-gray-100 px-1 rounded">chrome://extensions</code> and switch on <b>Developer mode</b>.</li>
            <li>Click <b>Load unpacked</b> and pick that folder.</li>
            <li>Open publish.gershon.ai once while signed in — the extension connects itself.</li>
            <li>To update: replace the files in the folder, then press <b>↻</b> on the extension card.</li>
          </ol>
        </Card>
        <Card title="B. Load unpacked from the folder" subtitle="Olivier's computer — the folder Claude keeps up to date.">
          <div className="flex items-start gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
            <FolderOpen size={16} className="mt-0.5 text-gray-500 flex-shrink-0" />
            <code className="text-xs text-gray-800 break-all flex-1">{EXTENSION_UNPACKED_FOLDER}</code>
            <button onClick={() => void copy()} title="Copy the path" className="text-gray-500 hover:text-gray-900"><Copy size={14} /></button>
          </div>
          {copied && <div className="text-[11px] text-emerald-700 mt-1">Copied.</div>}
          <p className="text-sm text-gray-700 mt-3">
            <code className="text-xs bg-gray-100 px-1 rounded">chrome://extensions</code> → <b>Load unpacked</b> → pick this folder; <b>↻</b> to update.
          </p>
          <p className="text-xs text-gray-500 mt-2">The extension also reloads itself within about 20 minutes when the folder holds a newer version and no post is going out.</p>
        </Card>
      </div>

      <Card title="Publishing Chromes seen" subtitle="Each Chrome checks in every 5 minutes: version, and which networks it is signed in to. Social's extension still publishes too during the transition; both take posts from the same queue, one at a time, so nothing goes out twice." className="mb-5">
        {!st ? <div className="text-xs text-gray-400">Loading…</div> : st.browsers === null ? <Unavailable error={st.browsersError} /> : (
          <div className="space-y-4">
            <BrowserTable title={`Publish extension (${pub.length})`} rows={pub} empty="No Chrome with the Publish extension has checked in yet." />
            {social.length > 0 && <BrowserTable title={`Social extension — still publishing during the transition (${social.length})`} rows={social} empty="" />}
          </div>
        )}
        {st?.seen && (
          <p className="text-[11px] text-gray-400 mt-3">Last seen in a publish.gershon.ai page: v{st.seen.version}, {ago(st.seen.lastSeenAt)}.</p>
        )}
      </Card>

      <Card title="Last deliveries" subtitle="Most recent published, failed and missed posts (all publishing Chromes).">
        {!st ? <div className="text-xs text-gray-400">Loading…</div> : st.deliveries === null ? <Unavailable error={st.deliveriesError} /> : st.deliveries.length === 0 ? (
          <p className="text-sm text-gray-600">No deliveries yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {st.deliveries.map((d) => (
              <li key={d.id} className="py-1.5 flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <NetBadge p={d.platform} /> <b className="font-medium text-gray-800">{d.company}</b>{" "}
                  {d.status === "POSTED" ? (
                    <span className="text-emerald-700">published{d.verified ? (d.verifiedVia === "collection" ? " · verified" : " · seen on the page") : " · not confirmed yet"}</span>
                  ) : (
                    <span className="text-red-700">{d.status === "MISSED" ? "missed" : "failed"}{d.error ? ` — ${d.error}` : ""}</span>
                  )}
                  {d.postUrl && <> · <a href={d.postUrl} target="_blank" rel="noreferrer" className="text-xs underline text-gray-600">open post</a></>}
                </span>
                <span className="text-xs text-gray-500 whitespace-nowrap">{ago(d.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function BrowserTable({ title, rows, empty }: { title: string; rows: BrowserView[]; empty: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">{title}</div>
      {rows.length === 0 ? <p className="text-sm text-gray-600">{empty}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                <th className="py-1.5 pr-2 font-medium">Chrome</th>
                <th className="py-1.5 pr-2 font-medium">Version</th>
                <th className="py-1.5 pr-2 font-medium">Last seen</th>
                <th className="py-1.5 pr-2 font-medium">LinkedIn</th>
                <th className="py-1.5 pr-2 font-medium">X</th>
                <th className="py-1.5 font-medium">Last post</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className="border-b border-gray-50 align-top">
                  <td className="py-1.5 pr-2"><span className="inline-flex items-center gap-1.5"><Dot tone={b.online ? "ok" : "off"} />{b.label}</span></td>
                  <td className={`py-1.5 pr-2 ${b.outOfDate ? "text-red-700 font-semibold" : "text-gray-700"}`}>v{b.version || "?"}{b.outOfDate ? " — update" : ""}</td>
                  <td className="py-1.5 pr-2 text-gray-600 whitespace-nowrap">{b.online ? "online" : ago(b.lastSeenAt)}</td>
                  <td className="py-1.5 pr-2 text-xs">{b.linkedinSignedIn ? <span className="text-emerald-700">signed in{b.linkedinName ? ` as ${b.linkedinName}` : ""} · {b.linkedinPages} page{b.linkedinPages === 1 ? "" : "s"}</span> : <span className="text-red-700">signed out</span>}</td>
                  <td className="py-1.5 pr-2 text-xs">{b.xSignedIn ? <span className="text-emerald-700">{b.x.length ? "@" + b.x.join(", @") : "signed in"}</span> : <span className="text-red-700">signed out</span>}</td>
                  <td className="py-1.5 text-xs text-gray-600">{b.lastPostAt ? ago(b.lastPostAt) : "—"}{b.lastError && <div className="text-red-700 truncate max-w-[260px]" title={b.lastError}>{b.lastError}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
