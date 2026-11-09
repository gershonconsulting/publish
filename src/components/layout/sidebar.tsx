"use client";

/**
 * The left menu — dark charcoal rail; red only marks the current page.
 * v0.13.0: All clients / picked company / switch client / Workspace.
 */

import { SocialMark, SocialWordmark } from "@/components/brand/social-mark";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { BarChart3, BookOpen, Bot, CalendarDays, LayoutDashboard, Link2, LogOut, Puzzle, Send, Settings, Sparkles, X } from "lucide-react";
import { FilterPanel } from "./filter-panel";
import { Avatar, ClientList } from "./client-list";
import { useSelectedClient } from "@/lib/selected-client";
import { cn } from "@/lib/utils";
import { PRODUCT_HOME } from "@/lib/product";

type NavItem = {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
};

/**
 * v0.13.0 (Olivier 2026-11-09: "The dashboard does not make sense … It should
 * be a global dashboard. Per client we should have a dashboard … Content and
 * review is listing all clients. no sense.").
 *
 * Two levels, always visible:
 *   • All clients — the global dashboard and the views that make sense across
 *     every company (calendar, connections, Autopilot).
 *   • The picked company — its own dashboard, its Content & review, calendar,
 *     funnel, connections and Knowledge Base. Shown only once a company is
 *     picked, under its name and logo.
 * Summary is gone: its month numbers live in the global dashboard's table.
 */
const globalItems: NavItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/publishing/calendar", icon: CalendarDays, label: "Calendar" },
  { href: "/publishing/funnel", icon: BarChart3, label: "Content funnel" },
  { href: "/publishing/accounts", icon: Link2, label: "Connections" },
  { href: "/publishing/autopilot", icon: Bot, label: "Autopilot" },
];

const clientItems: NavItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/publishing", icon: Send, label: "Content & review" },
  { href: "/publishing/calendar", icon: CalendarDays, label: "Calendar" },
  { href: "/publishing/funnel", icon: BarChart3, label: "Content funnel" },
  { href: "/publishing/accounts", icon: Link2, label: "Connections" },
  { href: "/knowledge-base", icon: BookOpen, label: "Knowledge Base" },
];

const workspaceItems: NavItem[] = [
  { href: "/intelligence", icon: Sparkles, label: "Intelligence" },
  { href: "/extension", icon: Puzzle, label: "Extension" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

function initials(name?: string | null, email?: string | null): string {
  const src = (name || email || "?").replace(/[^A-Za-z ]/g, " ").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}

export function Sidebar() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const { clientId, setClientId, clients } = useSelectedClient();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role?.toLowerCase() ?? "user";
  const picked = clientId ? clients?.find((c) => c.id === clientId) ?? null : null;

  const isActive = (href: string, list: NavItem[]) =>
    pathname === href ||
    // "/publishing" must not light up on /publishing/calendar etc. — those have their own entries.
    (pathname.startsWith(href + "/") && !list.some((o) => o.href !== href && o.href.startsWith(href + "/") && pathname.startsWith(o.href)));

  const link = (item: NavItem, list: NavItem[], scope: "all" | "client" | "none") => {
    const active = isActive(item.href, list) && (scope === "none" || (scope === "client") === !!clientId);
    const go = (e: React.MouseEvent) => {
      if (scope === "all" && clientId) { e.preventDefault(); setClientId(""); router.push(item.href); }
    };
    const href = scope === "client" && clientId ? `${item.href}?client=${clientId}` : item.href;
    return (
      <Link
        key={scope + item.href}
        href={href}
        onClick={go}
        className={cn(
          "flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-sm font-medium transition-colors",
          active ? "bg-[#23262D] text-white shadow-[inset_2px_0_0_#D92D20]" : "text-[#C9CDD4] hover:bg-[#1A1D23] hover:text-white",
        )}
      >
        <item.icon className="flex-shrink-0" size={17} strokeWidth={1.8} />
        {item.label}
      </Link>
    );
  };

  return (
    <aside className="w-[248px] flex-shrink-0 bg-[#111317] text-gray-300 flex flex-col h-screen sticky top-0 border-r border-[#1F2229]">
      {/* Brand */}
      <div className="px-5 pt-5 pb-4 border-b border-[#1F2229]">
        <Link href={PRODUCT_HOME} onClick={(e) => { if (clientId) { e.preventDefault(); setClientId(""); router.push(PRODUCT_HOME); } }} className="flex items-center gap-2.5">
          <SocialMark size={32} className="flex-shrink-0" />
          <SocialWordmark dark />
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5">
        {/* 1. Every company */}
        <div className="space-y-0.5">
          <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7D838E]">All clients</div>
          {globalItems.map((i) => link(i, globalItems, "all"))}
        </div>

        {/* 2. The picked company */}
        {clientId && (
          <div className="rounded-lg bg-[#171A1F] border border-[#23262D] p-1.5 space-y-0.5">
            <div className="flex items-center gap-2 px-1.5 pt-1 pb-2">
              {picked ? <Avatar c={picked} size={26} /> : <span className="w-[26px] h-[26px] rounded-md bg-[#2A2E37]" />}
              <div className="min-w-0 flex-1 leading-tight">
                <div className="text-[13px] font-semibold text-white truncate" title={picked?.name}>{picked?.name || "Loading…"}</div>
                <div className="text-[10.5px] text-[#7D838E]">{picked?.clientType === "INTERNAL" ? "Internal" : "Campaign client"}</div>
              </div>
              <button
                onClick={() => { setClientId(""); router.push("/dashboard"); }}
                title="Back to all clients"
                aria-label="Back to all clients"
                className="w-6 h-6 rounded flex items-center justify-center text-[#8E949F] hover:bg-[#23262D] hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
            {clientItems.map((i) => link(i, clientItems, "client"))}
          </div>
        )}

        {/* 3. Switch company */}
        <ClientList />

        {/* 4. Workspace tools */}
        <div className="space-y-0.5">
          <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7D838E]">Workspace</div>
          {workspaceItems.map((i) => link(i, workspaceItems, "none"))}
        </div>

        <FilterPanel />
      </nav>

      {/* User footer */}
      <div className="px-3 py-3 border-t border-[#1F2229]">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="w-8 h-8 rounded-full bg-[#2A2E37] text-white text-xs font-semibold flex items-center justify-center flex-shrink-0">
            {initials(session?.user?.name, session?.user?.email)}
          </div>
          <div className="flex-1 min-w-0 leading-tight">
            <div className="text-[13px] font-medium text-white truncate">{session?.user?.name}</div>
            <div className="text-xs text-[#8E949F] truncate capitalize">{role}</div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            aria-label="Sign out"
            title="Sign out"
            className="w-8 h-8 rounded-md flex items-center justify-center text-[#8E949F] hover:bg-[#1A1D23] hover:text-white transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
