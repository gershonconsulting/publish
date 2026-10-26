"use client";

/**
 * Selected client — the CloudCampaign-style client list in the left menu
 * (v0.3.0, Olivier 2026-10-26: "On the left side, I should have every single
 * one of our clients, pretty much the same way CloudCampaign was set up").
 *
 * One selection shared by the whole app: Content & review, Calendar,
 * Connections and the Knowledge Base all narrow to the client picked in the
 * menu. "" means All clients.
 *
 * The selection lives in the URL (?client=<id>) so a link opens on the same
 * client, and in localStorage so it survives a reload or a new tab.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type MenuClient = { id: string; name: string; clientType: string; logoUrl: string | null; status?: string };

type Ctx = {
  clientId: string;
  setClientId: (id: string) => void;
  clients: MenuClient[] | null;
  error: string | null;
  reload: () => void;
};

const SelectedClientContext = createContext<Ctx>({
  clientId: "",
  setClientId: () => {},
  clients: null,
  error: null,
  reload: () => {},
});

const KEY = "publish.client";

function writeUrl(id: string) {
  try {
    const u = new URL(window.location.href);
    if (id) u.searchParams.set("client", id);
    else u.searchParams.delete("client");
    window.history.replaceState(window.history.state, "", u.toString());
  } catch {
    /* ignore */
  }
}

export function SelectedClientProvider({ children }: { children: React.ReactNode }) {
  const [clientId, setId] = useState("");
  const [clients, setClients] = useState<MenuClient[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // First paint agrees with the server (""); the stored choice is read after.
  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("client");
      const stored = window.localStorage.getItem(KEY);
      const id = fromUrl ?? stored ?? "";
      if (id) setId(id);
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/clients?light=1", { cache: "no-store" });
      const j = await r.json();
      const rows = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : null;
      if (!rows) throw new Error(j?.error || "Could not load the clients.");
      setClients(
        (rows as MenuClient[])
          .map((c) => ({ id: c.id, name: c.name, clientType: c.clientType, logoUrl: c.logoUrl ?? null, status: c.status }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the clients.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A stored id for a client that no longer exists (archived, other product)
  // falls back to All clients instead of an empty page.
  useEffect(() => {
    if (clients && clientId && !clients.some((c) => c.id === clientId)) {
      setId("");
      try { window.localStorage.removeItem(KEY); } catch {}
      writeUrl("");
    }
  }, [clients, clientId]);

  // Keep the URL in step on every page change (Next replaces the query).
  useEffect(() => {
    if (clientId) writeUrl(clientId);
  });

  const setClientId = useCallback((id: string) => {
    setId(id);
    try {
      if (id) window.localStorage.setItem(KEY, id);
      else window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    writeUrl(id);
  }, []);

  const value = useMemo(() => ({ clientId, setClientId, clients, error, reload: () => void load() }), [clientId, setClientId, clients, error, load]);
  return <SelectedClientContext.Provider value={value}>{children}</SelectedClientContext.Provider>;
}

export function useSelectedClient(): Ctx {
  return useContext(SelectedClientContext);
}
