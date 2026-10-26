"use client";

/**
 * ClientList — every client in the left menu, CloudCampaign-style (v0.3.0).
 *
 * "All clients" on top, then the companies grouped Campaign / Internal, each
 * with its logo (or initials). Clicking one narrows every Publish page to that
 * client; clicking it again goes back to All clients. A search box appears once
 * the list is long enough to need one.
 */

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Layers, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSelectedClient, type MenuClient } from "@/lib/selected-client";

const GROUPS: { key: string; label: string }[] = [
  { key: "CAMPAIGN", label: "Campaign clients" },
  { key: "INTERNAL", label: "Internal" },
];

const PALETTE = ["#D92D20", "#2563EB", "#059669", "#7C3AED", "#D97706", "#0891B2", "#DB2777", "#4B5563"];
function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}

function Avatar({ c }: { c: MenuClient }) {
  const [broken, setBroken] = useState(false);
  if (c.logoUrl && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={c.logoUrl} alt="" onError={() => setBroken(true)} className="w-6 h-6 rounded-md object-contain bg-white flex-shrink-0" />
    );
  }
  return (
    <span className="w-6 h-6 rounded-md text-[10px] font-semibold text-white flex items-center justify-center flex-shrink-0" style={{ background: colorFor(c.id) }}>
      {initials(c.name)}
    </span>
  );
}

/** Pages that follow the selected client. Anywhere else, picking a client opens Content & review. */
const CLIENT_PAGES = ["/publishing", "/publishing/calendar", "/publishing/accounts", "/knowledge-base"];

export function ClientList() {
  const { clientId, setClientId, clients, error, reload } = useSelectedClient();
  const [q, setQ] = useState("");
  const pathname = usePathname() || "";
  const router = useRouter();

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (clients || []).filter((c) => !needle || c.name.toLowerCase().includes(needle));
    return GROUPS.map((g) => ({ ...g, items: list.filter((c) => c.clientType === g.key) })).filter((g) => g.items.length > 0);
  }, [clients, q]);

  function pick(id: string) {
    setClientId(id);
    if (!CLIENT_PAGES.includes(pathname)) router.push(id ? `/publishing?client=${id}` : "/publishing");
  }

  const row = (active: boolean) =>
    cn(
      "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-colors text-left",
      active ? "bg-[#23262D] text-white shadow-[inset_2px_0_0_#D92D20]" : "text-[#C9CDD4] hover:bg-[#1A1D23] hover:text-white",
    );

  return (
    <div className="space-y-0.5">
      <div className="px-2.5 pb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7D838E]">
        <span>Clients</span>
        {clients && <span className="font-mono normal-case tracking-normal">{clients.length}</span>}
      </div>

      {(clients?.length || 0) > 8 && (
        <div className="relative px-1 pb-1.5">
          <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-[60%] text-[#7D838E]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a client"
            className="w-full bg-[#1A1D23] border border-[#2A2E37] rounded-md pl-7 pr-2 py-1.5 text-[13px] text-white placeholder:text-[#7D838E] focus:outline-none focus:border-[#4B5060]"
          />
        </div>
      )}

      <button onClick={() => pick("")} className={row(!clientId)}>
        <span className="w-6 h-6 rounded-md bg-[#2A2E37] flex items-center justify-center flex-shrink-0">
          <Layers size={13} />
        </span>
        All clients
      </button>

      {error && (
        <div className="px-2.5 py-1.5 text-xs text-red-300">
          {error} <button onClick={reload} className="underline">Retry</button>
        </div>
      )}
      {!clients && !error && <div className="px-2.5 py-1.5 text-xs text-[#7D838E]">Loading clients…</div>}

      {groups.map((g) => (
        <div key={g.key} className="pt-2">
          <div className="px-2.5 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5F6570]">{g.label}</div>
          {g.items.map((c) => (
            <button key={c.id} onClick={() => pick(clientId === c.id ? "" : c.id)} className={row(clientId === c.id)} title={c.name}>
              <Avatar c={c} />
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
      ))}
      {clients && q && groups.length === 0 && <div className="px-2.5 py-1.5 text-xs text-[#7D838E]">No client matches “{q}”.</div>}
    </div>
  );
}
