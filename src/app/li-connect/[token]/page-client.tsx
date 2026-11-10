"use client";

/**
 * v0.14.0 — "Connect your LinkedIn profile" for the person we post for
 * (e.g. a client's CEO). One button: LinkedIn's own sign-in and Allow screen;
 * the password is typed on linkedin.com only, never here.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";

type Data = {
  client: string; logoUrl: string | null; reviewerName: string | null; profile: string | null;
  connected: { name: string; vanity: string | null; at: string; expiresAt: string; error: string | null } | null;
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export function LiConnectClient({ token }: { token: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ ok?: string; error?: string }>({});

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    setFlash({ ok: sp.get("connected") || undefined, error: sp.get("error") || undefined });
    if (sp.toString()) history.replaceState(null, "", location.pathname);
    fetch(`/api/li-connect/${token}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j?.success ? setData(j.data) : setErr(j?.error || "This link is not valid any more.")))
      .catch(() => setErr("Could not load this page. Please refresh."));
  }, [token]);

  if (err) return <Center><p className="text-gray-700 max-w-md">{err}</p></Center>;
  if (!data) return <Center><Loader2 className="animate-spin text-gray-400" /></Center>;

  const c = data.connected;
  const expired = !!c && new Date(c.expiresAt).getTime() < Date.now();
  const ok = !!c && !c.error && !expired;
  const who = data.reviewerName || "you";
  const profile = data.profile ? `linkedin.com/in/${data.profile}` : null;

  return (
    <div className="min-h-screen bg-[#f5f6f8]">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-xl mx-auto px-4 py-5 flex items-center gap-3">
          {data.logoUrl && <img src={data.logoUrl} alt="" className="w-10 h-10 rounded-md object-contain bg-white border border-gray-100" />}
          <div>
            <div className="text-xs text-gray-500">Gershon Consulting · Publish · {data.client}</div>
            <h1 className="text-xl font-semibold text-gray-900">Connect your LinkedIn profile</h1>
          </div>
        </div>
      </header>
      <main className="max-w-xl mx-auto px-4 py-6 space-y-4">
        {flash.error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex gap-2"><XCircle size={18} className="shrink-0 mt-0.5" />{flash.error}</div>
        )}
        <div className={`rounded-xl p-4 text-white font-semibold ${ok ? "bg-emerald-600" : "bg-red-600"}`}>
          {ok
            ? <span className="flex items-center gap-2"><CheckCircle2 size={18} /> Connected as {c!.name}{flash.ok ? " — thank you!" : ""}</span>
            : expired ? "The connection has expired — please connect again." : c?.error ? "The connection stopped working — please connect again." : "Not connected yet."}
        </div>
        {ok && <p className="text-xs text-gray-500 -mt-2">LinkedIn asks for a new Allow from time to time. This connection is valid until {day(c!.expiresAt)}; we will send you the link again before then.</p>}

        <section className="bg-white rounded-xl border border-gray-200 p-5 text-sm text-gray-700 space-y-3">
          <p>
            Gershon Consulting publishes the posts {who === "you" ? "you" : <b>{who}</b>} approved on {profile ? <b>{profile}</b> : "your personal LinkedIn profile"}.
            Connect it once: you sign in on <b>LinkedIn&apos;s own page</b> and click <b>Allow</b>.
          </p>
          <ol className="list-decimal pl-5 space-y-1 text-gray-600">
            <li>Click the button below.</li>
            <li>On linkedin.com, sign in with your own account{profile ? <> (<b>{profile}</b>)</> : null}.</li>
            <li>Click <b>Allow</b>. You come back here with a green bar.</li>
          </ol>
          <a href={`/api/li-connect/${token}/start`} className="inline-flex items-center gap-2 rounded-lg bg-[#0a66c2] text-white font-semibold px-5 py-2.5">
            {ok ? "Reconnect LinkedIn" : "Connect LinkedIn"}
          </a>
          <p className="flex gap-2 text-xs text-gray-500 pt-1">
            <ShieldCheck size={16} className="shrink-0 text-gray-400" />
            Your password is typed on linkedin.com only; Gershon Consulting never sees it. Publish only posts the content you approved
            — it cannot read your messages or your network. You can remove its access at any time in LinkedIn → Settings → Data privacy → Permitted services.
          </p>
        </section>
      </main>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center bg-[#f5f6f8] px-4 text-center">{children}</div>;
}
