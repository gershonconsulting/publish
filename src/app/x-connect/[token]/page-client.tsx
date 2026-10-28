"use client";

/**
 * v0.8.1 — "Connect your X account" for a client. One button: X's own sign-in
 * and Allow screen; the password is typed on x.com only, never here.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";

type Data = { client: string; logoUrl: string | null; xHandle: string | null; connected: { username: string; at: string; error: string | null } | null };

export function XConnectClient({ token }: { token: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ ok?: string; error?: string }>({});

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    setFlash({ ok: sp.get("connected") || undefined, error: sp.get("error") || undefined });
    if (sp.toString()) history.replaceState(null, "", location.pathname);
    fetch(`/api/x-connect/${token}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j?.success ? setData(j.data) : setErr(j?.error || "This link is not valid.")))
      .catch(() => setErr("Could not load this page. Please refresh."));
  }, [token]);

  if (err) return <Center><p className="text-gray-700 max-w-md">{err}</p></Center>;
  if (!data) return <Center><Loader2 className="animate-spin text-gray-400" /></Center>;

  const ok = !!data.connected && !data.connected.error;
  const handle = data.xHandle ? `@${data.xHandle}` : "your company's X account";

  return (
    <div className="min-h-screen bg-[#f5f6f8]">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-xl mx-auto px-4 py-5 flex items-center gap-3">
          {data.logoUrl && <img src={data.logoUrl} alt="" className="w-10 h-10 rounded-md object-contain bg-white border border-gray-100" />}
          <div>
            <div className="text-xs text-gray-500">Gershon Consulting · Publish</div>
            <h1 className="text-xl font-semibold text-gray-900">Connect {data.client}&apos;s X account</h1>
          </div>
        </div>
      </header>
      <main className="max-w-xl mx-auto px-4 py-6 space-y-4">
        {flash.error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex gap-2"><XCircle size={18} className="shrink-0 mt-0.5" />{flash.error}</div>
        )}
        <div className={`rounded-xl p-4 text-white font-semibold ${ok ? "bg-emerald-600" : "bg-red-600"}`}>
          {ok
            ? <span className="flex items-center gap-2"><CheckCircle2 size={18} /> Connected as @{data.connected!.username}{flash.ok ? " — thank you!" : ""}</span>
            : data.connected?.error ? "The connection stopped working — please connect again." : "Not connected yet."}
        </div>

        <section className="bg-white rounded-xl border border-gray-200 p-5 text-sm text-gray-700 space-y-3">
          <p>
            Gershon Consulting publishes the posts you approve on {handle}. Connect it once: you will sign in on
            <b> X&apos;s own page</b> and click <b>Allow</b>.
          </p>
          <ol className="list-decimal pl-5 space-y-1 text-gray-600">
            <li>Click the button below.</li>
            <li>On x.com, sign in as <b>{handle}</b> (if you are signed in as another account, switch first).</li>
            <li>Click <b>Allow</b>. You come back here with a green bar.</li>
          </ol>
          <a href={`/api/x-connect/${token}/start`} className="inline-flex items-center gap-2 rounded-lg bg-black text-white font-semibold px-5 py-2.5">
            {ok ? "Reconnect X" : "Connect X account"}
          </a>
          <p className="flex gap-2 text-xs text-gray-500 pt-1">
            <ShieldCheck size={16} className="shrink-0 text-gray-400" />
            Your password is typed on x.com only; Gershon Consulting never sees it. Publish can only post the content you
            approved, and you can remove its access at any time in X → Settings → Security → Connected apps.
          </p>
        </section>
      </main>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center bg-[#f5f6f8] px-4 text-center">{children}</div>;
}
