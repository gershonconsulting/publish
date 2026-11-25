/**
 * v0.25.0 — the list behind the weekly feature-status email (PUB-217).
 * Olivier 2026-11-24: "Send the status of all features to social@gershonconsulting.com
 * when development. Red started, Orange pending validation, Green done — weekly."
 *
 * KEEP THIS UP TO DATE IN THE SAME COMMIT AS THE WORK (rule in STATUS.md):
 *   started    🔴 work has begun, not built / not finished
 *   validation 🟠 built — waiting for Olivier's OK, a merge/deploy, or a live check
 *   done       🟢 live on publish.gershon.ai
 * `since` = the date (YYYY-MM-DD, New York) the feature reached its current status.
 */
export type FeatureState = "started" | "validation" | "done";
export type Feature = { id: string; title: string; version?: string; state: FeatureState; since: string; note?: string };

export const FEATURES: Feature[] = [
  // 🔴 started
  { id: "personal-li-rollout", title: "Posting on people's own LinkedIn profiles — every person account", state: "started", since: "2026-11-09",
    note: "Altavia: Alexandre has to click Allow on his link, then first post checked; WALLIX (Jean-Noël) next" },
  { id: "brand-every-client", title: "Brand section (colours, fonts, logo) filled for every client", state: "started", since: "2026-11-10",
    note: "\"Read from website\" per client + brand books clients shared" },
  { id: "kb-every-client", title: "Knowledge Base complete and validated by every client", state: "started", since: "2026-11-19",
    note: "Client links opened; Flying Secoya contact emails still missing" },
  { id: "altavia-tag", title: "Altavia @company tag", state: "started", since: "2026-11-19",
    note: "LinkedIn page number + X handle still to set" },

  // 🟠 pending validation
  { id: "picture-options", title: "3 picture options per post — real photos first, AI only when nothing matched", version: "0.26.0", state: "validation", since: "2026-11-25",
    note: "Team picks 1 of 3 before sending for validation; better photos once a Pexels API key is added (PEXELS_API_KEY)" },
  { id: "company-tag-browser", title: "Real @company tag when posting through the Chrome extension", version: "0.24.0", state: "validation", since: "2026-11-24",
    note: "Live since build 55; extension 0.3.0 on Olivier's computer, then check the first live post" },

  // 🟢 done (live)
  { id: "client-email-posts", title: "Client review emails show the posts + subject \"Publish by Gershon.AI - <Company> - <Month>\"", version: "0.25.2", state: "done", since: "2026-11-24" },
  { id: "review-link-focus", title: "Review link opens on the posts of the email (batch or post); \"Approve all\" approves only those", version: "0.25.1", state: "done", since: "2026-11-24" },
  { id: "feature-status-email", title: "Weekly feature-status email to social@ (this email)", version: "0.25.0", state: "done", since: "2026-11-24" },
  { id: "no-weekends", title: "No weekend publishing for any client", version: "0.24.1", state: "done", since: "2026-11-24" },
  { id: "calendar-clickable", title: "Calendar: posts are clickable", version: "0.24.1", state: "done", since: "2026-11-24" },
  { id: "monthly-once", title: "Monthly client email sent once per client per month", version: "0.23.1", state: "done", since: "2026-11-23" },
  { id: "knowledge-links", title: "Knowledge links — one link per client to validate what we know", version: "0.23.0", state: "done", since: "2026-11-19" },
  { id: "semi-autopilot", title: "Semi-autopilot (team checks before the client), working days only, @company tag", version: "0.22.0", state: "done", since: "2026-11-19" },
  { id: "conn-report", title: "Weekly connections report to report@ (PUB-215)", version: "0.21.0", state: "done", since: "2026-11-19" },
  { id: "conn-history", title: "Connection history per company", version: "0.20.0", state: "done", since: "2026-11-18" },
  { id: "one-email-burst", title: "One email per burst of client comments / change requests", version: "0.19.3", state: "done", since: "2026-11-18" },
  { id: "connections-split", title: "Connections per company + clickable accounts", version: "0.19.2", state: "done", since: "2026-11-18" },
  { id: "published-links", title: "Client dashboard: clickable links to published posts", version: "0.19.0", state: "done", since: "2026-11-17" },
  { id: "email-reliability", title: "Email reliability: no duplicates, retries, brand red", version: "0.18.6", state: "done", since: "2026-11-16" },
  { id: "brand-kb", title: "Brand identity in the Knowledge Base", version: "0.18.0", state: "done", since: "2026-11-10" },
  { id: "kb-validation", title: "Knowledge validation — internal check, then client", version: "0.17.0", state: "done", since: "2026-11-10" },
  { id: "review-external-only", title: "Client review page shows only the exchange with the client", version: "0.16.2", state: "done", since: "2026-11-10" },
  { id: "personal-li-connect", title: "Personal LinkedIn connect links + expiry reminder (PUB-213)", version: "0.14.0", state: "done", since: "2026-11-09" },
  { id: "dashboards", title: "Global dashboard + one dashboard per client", version: "0.13.0", state: "done", since: "2026-11-09" },
];
