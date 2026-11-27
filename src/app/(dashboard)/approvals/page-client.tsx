"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink, Plus } from "lucide-react";
import { useSelectedClient } from "@/lib/selected-client";

type Approval = { token: string; name: string; clientId: string | null; scopeName: string; createdAt: string; count: number; url: string };
type Item = { id: string; title: string | null; text: string; status: string; clientId: string | null; createdAt: string };
type Selection = { items: Item[]; clients: { id: string; name: string }[]; workspace: string };
const STATUS_LABELS: Record<string, string> = { DRAFT: "To do", IN_REVIEW: "Waiting for validation", CHANGES_REQUESTED: "Changes requested", APPROVED: "Approved" };
const statusLabel = (status: string) => STATUS_LABELS[status] || status.replaceAll("_", " ").toLowerCase();
const field = "border border-gray-300 rounded-md px-3 py-2 text-sm bg-white";
const button = "inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50";

async function read(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const json = await response.json();
  if (!response.ok || !json.success) throw new Error(json.error || "Could not load approvals.");
  return json.data;
}

export function ApprovalsClient() {
  const { clientId } = useSelectedClient();
  const [links, setLinks] = useState<Approval[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    read(`/api/publishing/approvals${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""}`)
      .then((d) => { if (active) { setLinks(d.links); setCanWrite(d.canWrite); } })
      .catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [clientId, revision]);

  return <main className="p-6 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-semibold text-gray-900">Approval links</h2>
      {canWrite && !creating && <button className={button} onClick={() => { setCreating(true); setCreated(""); }}><Plus size={16} />Create approval link</button>}
    </div>
    {creating && <CreateApproval key={clientId} initialClient={clientId} onCancel={() => setCreating(false)} onCreated={(url) => { setCreated(url); setCreating(false); setRevision((v) => v + 1); }} />}
    {created && <div role="status" className="p-4 rounded-lg border border-emerald-200 bg-emerald-50 space-y-2">
      <p className="text-sm text-emerald-900">Approval link created. Share it with your client.</p>
      <LinkActions url={created} />
    </div>}
    {error && <div role="alert" className="text-sm text-red-700">{error} <button className="underline" onClick={() => setRevision((v) => v + 1)}>Retry</button></div>}
    {loading ? <p className="text-sm text-gray-500">Loading approval links…</p> : !error && (links.length ? <>
      <div className="space-y-3 md:hidden">{links.map((a) => <article key={a.token} className="rounded-lg border bg-white p-4 space-y-3">
        <h3 className="font-medium text-gray-900 break-words">{a.name}</h3>
        <p className="text-sm text-gray-600">{a.scopeName} · {a.count} post{a.count === 1 ? "" : "s"}</p>
        <p className="text-xs text-gray-500">Created {new Date(a.createdAt).toLocaleString()}</p>
        <LinkActions url={a.url} />
      </article>)}</div>
      <div className="hidden md:block overflow-x-auto border rounded-lg bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-gray-600"><tr>{["Request", "Client / workspace", "Created", "Posts", "Link"].map((label) => <th key={label} className="p-3 font-medium">{label}</th>)}</tr></thead>
        <tbody>{links.map((a) => <tr key={a.token} className="border-t align-top">
          <td className="p-3 font-medium text-gray-900">{a.name}</td><td className="p-3">{a.scopeName}</td>
          <td className="p-3 whitespace-nowrap">{new Date(a.createdAt).toLocaleString()}</td><td className="p-3">{a.count}</td>
          <td className="p-3"><LinkActions url={a.url} /></td>
        </tr>)}</tbody>
      </table>
    </div></> : <p className="text-sm text-gray-500 border border-dashed rounded-lg p-6 text-center">No approval links yet{clientId ? " for this client" : ""}.</p>)}
  </main>;
}

function LinkActions({ url }: { url: string }) {
  const [message, setMessage] = useState("");
  const [manual, setManual] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(url); setMessage("Link copied"); setManual(false); }
    catch { setManual(true); setMessage("Select and copy this link:"); }
  }
  return <div className="flex flex-wrap items-center gap-2">
    <a href={url} target="_blank" rel="noopener noreferrer" className={button}><ExternalLink size={14} />Open link</a>
    <button className={button} onClick={copy}><Copy size={14} />Copy link</button>
    {message && <span role="status" className="text-xs text-gray-600">{message}</span>}
    {manual && <input aria-label="Approval link" readOnly value={url} onFocus={(e) => e.target.select()} className={`${field} w-full`} />}
  </div>;
}

function CreateApproval({ initialClient, onCancel, onCreated }: { initialClient: string; onCancel: () => void; onCreated: (url: string) => void }) {
  const [scope, setScope] = useState(initialClient);
  const [name, setName] = useState("");
  const [data, setData] = useState<Selection | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setData(null);
    read(`/api/publishing/approvals?select=1${scope ? `&clientId=${encodeURIComponent(scope)}` : ""}`)
      .then((d) => { if (active) setData(d); })
      .catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [scope, revision]);
  const clientName = useCallback((id: string | null) => data?.clients.find((c) => c.id === id)?.name || data?.workspace || "Workspace", [data]);
  const shown = (data?.items || []).filter((i) => (!status || status === i.status) && `${i.title || ""} ${i.text} ${clientName(i.clientId)}`.toLowerCase().includes(search.toLowerCase()));
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const result = await read("/api/publishing/approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, clientId: scope || null, ids: [...selected] }) });
      onCreated(result.url);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create the link."); setBusy(false); }
  }
  return <form onSubmit={submit} className="rounded-lg border bg-white p-5 space-y-4">
    <h3 className="font-semibold text-gray-900">Create approval link</h3>
    <div className="grid gap-4 md:grid-cols-2">
      <label className="text-sm font-medium">Request name<input required maxLength={160} disabled={busy} value={name} onChange={(e) => setName(e.target.value)} placeholder="Amphasys – Publications de décembre" className={`${field} block mt-1 w-full`} /></label>
      <label className="text-sm font-medium">Client / workspace<select disabled={busy || loading} value={scope} onChange={(e) => { setScope(e.target.value); setSelected(new Set()); setStatus(""); }} className={`${field} block mt-1 w-full`}>
        <option value="">{data?.workspace || "Workspace"} — all content</option>
        {data?.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select></label>
    </div>
    <p className="text-sm text-gray-500">Choose posts in any status. Creating this link keeps their statuses unchanged. Selected posts stay in the link when their statuses change.</p>
    <div className="flex flex-wrap gap-3">
      <input aria-label="Search content" placeholder="Search content…" value={search} onChange={(e) => setSearch(e.target.value)} className={`${field} flex-1`} />
      <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className={field}>
        <option value="">All statuses</option>
        {[...new Set(data?.items.map((i) => i.status))].sort().map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
      </select>
    </div>
    <p className="text-sm text-gray-600" aria-live="polite">{selected.size} selected · {shown.length} shown{selected.size > 0 && " · selections are kept when filtering"}</p>
    <div className="max-h-96 overflow-y-auto rounded-md border divide-y">
      {loading ? <p className="p-4 text-sm text-gray-500">Loading content…</p> : shown.length ? shown.map((i) => <label key={i.id} className="flex gap-3 p-3 cursor-pointer hover:bg-gray-50">
        <input type="checkbox" className="mt-1" disabled={busy} checked={selected.has(i.id)} onChange={(e) => setSelected((prev) => { const next = new Set(prev); if (e.target.checked) next.add(i.id); else next.delete(i.id); return next; })} />
        <div className="min-w-0 flex-1"><div className="font-medium text-sm text-gray-900">{i.title || i.text.slice(0, 90) || "Untitled post"}</div>
          <p className="text-sm text-gray-500 line-clamp-2 whitespace-pre-wrap">{i.text}</p>
          <p className="text-xs text-gray-500 mt-1">{clientName(i.clientId)} · {statusLabel(i.status)} · {new Date(i.createdAt).toLocaleDateString()}</p>
        </div>
      </label>) : <p className="p-4 text-sm text-gray-500">No matching content.</p>}
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error} {!data && <button type="button" className="underline" onClick={() => setRevision((v) => v + 1)}>Retry</button>}</p>}
    {selected.size > 2000 && <p className="text-sm text-red-700">Choose up to 2,000 posts per link.</p>}
    <div className="flex gap-2">
      <button type="submit" disabled={busy || loading || !data || !name.trim() || !selected.size || selected.size > 2000} className={`${button} !bg-gray-900 text-white hover:!bg-gray-800`}>{busy ? "Creating…" : `Create link (${selected.size})`}</button>
      <button type="button" disabled={busy} onClick={onCancel} className={button}>Cancel</button>
    </div>
  </form>;
}
