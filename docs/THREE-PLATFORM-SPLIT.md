# Three-platform split — developer handoff

Date: 24 October 2026  
Revision: 3 — publishing access, monthly work-completion reporting and client intelligence positioning added.  
Status: implementation specification for developer review; no application changes made.  
Source: Gershonconsulting/social, default/deploy branch `claude/social-campaign-verification-jiG5E`, commit `bb3f07ee870f9cc7ae0e225878a21cc43a78033a` (package version 4.63.0).

## 1. Objective and authority

The current application combines three products. Separate them into three platforms with clear responsibilities, access controls and deployment boundaries.

| Platform | Domain | Audience | Core question |
|---|---|---|---|
| Publish | https://publish.gershon.ai | Internal Gershon team | What are we creating, approving, scheduling and publishing? |
| Social | https://social.gershon.ai | Clients using their own standalone platform | Who is posting what in our business world, what does it mean, and where should we act? |
| Social Tracking | https://socialtracking.gershon.ai | Internal Gershon team | Was the agreed work completed, and what evidence supports the monthly client report? |

**Confirmed by Olivier:** these three domains, internal/client audiences, Social's collection scope, and Social Tracking's verification purpose. This assignment covers documentation only. The developer performs the code split.

**Recommended design below:** implementation boundaries, data ownership, integration contracts, verification semantics and migration sequence. These are proposed requirements for the developer handoff, not claims that the split or its infrastructure already exists. Open business choices are listed in section 12. Section 14 adds the requested dashboard, reporting, alerting and intelligence scope for all three new versions.

Deliver three independently deployable applications. Three menus, host aliases, or copies of the complete application with hidden navigation do not satisfy the objective. A monorepo is acceptable; three GitHub repositories are optional.

## 2. Product boundaries

### Publish — internal content production and delivery

Own:
- Content drafts, generation, revisions and company knowledge used to produce content.
- Internal editorial review and approval, content inventory and readiness.
- Publishing calendar, scheduling, target accounts and delivery execution.
- Publishing account credentials, OAuth connections and publishing extension commands.
- Client access onboarding for LinkedIn company Pages, Google Business Profile locations and X company accounts, as specified in section 15.
- Autopilot, delivery retries and operational publishing errors.
- Content-readiness reports and delivery execution logs.

Publish records intent, attempts and delivery receipts. A successful attempt is a delivery claim until independently observed. Publish can display Tracking's verification outcome without owning its calculation.

Clients must not receive general access to Publish. Existing token-based client review and connection pages need an explicit exception decision (section 12); preserve them during migration until that decision is implemented.

### Social — standalone client intelligence platform

Primary purpose: clients gather intelligence about their own business world—who is posting what across their company, clients, partners, competitors and other selected sources. Tracking interactions on their own posts is a supporting capability. Section 17 defines this positioning and client workflow.

Own:
- A workspace's tracked sources: company, clients, partners and competitors.
- Source profiles, network connections for collection, collection requests and jobs.
- Observed posts, canonical post identifiers/URLs, text, publication dates, metrics and collection provenance.
- Browsing, searching, calendar views, hashtags, topics, follower history and competitive/content analysis.
- Client-facing collection health, freshness, exports and intelligence reports.
- Collection extension binding and collection credentials scoped to the workspace.

Collection access does not authorize posting to an account. A competitor or partner being monitored must never automatically become a publishing target or a contractual posting obligation.

Each client sees only its authorized workspace. Gershon can operate collection for authorized managed clients through explicit permissions. The relationship label “client” is not itself an authorization rule.

Social must not expose internal publishing queues, agency-wide compliance dashboards, credentials or other clients' sources.

### Social Tracking — internal work completion and monthly reporting

Primary purpose: verify that the agreed client work has been completed and assemble accurate, evidence-backed monthly reports. Operational dashboards, weekly summaries and alerts support this monthly reporting workflow. Section 16 defines the monthly report requirements.

Own:
- Posting requirements: account/network, frequency or exact slots, active dates, exclusions, reporting timezone and deadline/grace policy.
- Expected-versus-observed reconciliation per company/account/network and reporting period.
- Independent verification evidence, overdue/missing/unknown states and discrepancy history.
- Monthly work-completion reports, campaign attainment, supporting posting reports and missed-work alerts.
- Investigation views linking a requirement, publishing intent/attempt and actual observed post.

Track commitments fulfilled through Publish **and through external/manual publishing**. Neither an internal delivery receipt nor a content draft proves a live post exists.

Tracking must never execute a publication or retry a failed delivery. An operator may follow a link to Publish to resolve delivery problems.

## 3. Recommended architecture and data flow

Use three deployable apps plus narrowly shared libraries/contracts. Prefer a monorepo for the first split to preserve history and ease extraction; the developer may choose separate repositories with the same boundaries.

Suggested logical layout:
- `apps/publish`: editorial workflow, publishing API/UI and publishing jobs.
- `apps/social`: collection API/UI, collection jobs and client intelligence.
- `apps/socialtracking`: requirements, reconciliation, verification and internal reports.
- `packages/contracts`: versioned integration schemas and stable identifiers.
- `packages/shared-ui`: reusable presentation components only.
- Shared identity/tenant utilities if needed, without granting one app another app's authority.

Data flow:
1. Social collects and stores independently observed posts.
2. Publish sends scheduled delivery intent and subsequent delivery-attempt events to Tracking.
3. Tracking reads authorized observed posts from Social and reconciles them with posting requirements.
4. Publish may consume Social content/intelligence as drafting context only when authorized.
5. Tracking exposes verification outcomes back to Publish for operator visibility.

Social remains useful when Publish is unavailable. Tracking must show delayed/missing evidence when Social is unavailable; it must not invent success or automatically publish.

## 4. Existing code: extraction map

These paths exist in the inspected commit. They are extraction starting points, not permission to move an entire mixed file without inspecting its handlers.

| Current area | Destination / treatment |
|---|---|
| `src/app/(dashboard)/publishing/**`, `src/components/publishing/**`, `src/app/api/publishing/**` | Publish |
| `src/app/(dashboard)/knowledge-base/**`, `src/app/api/knowledge-base/**`, `src/lib/knowledge-base.ts` | Publish; expose a limited authorized interface if Social needs reference context |
| `src/lib/publishing*.ts`, `src/lib/publish-*.ts`, `src/lib/autopilot.ts`, `src/lib/linked-publish.ts` | Publish; extract independent verification logic into Tracking where mixed |
| `src/app/api/extension/publish/**`, `extension-src/gx-publish.js` | Publish execution capability |
| `src/app/(dashboard)/clients/**`, `src/components/clients/**` | Split: collection/intelligence into Social; compliance/objectives into Tracking; drafting/Post Studio into Publish |
| `src/app/api/clients/[id]/posts`, `hashtags`, `word-cloud`, `content-analysis`, `competitors/**` | Social |
| `src/app/api/collect/**`, collection/ingest extension handlers, Phantombuster and scrape/import handlers | Social |
| `src/lib/adapters/**`, `src/lib/collect/**`, `src/lib/competitors/**`, `src/lib/collection-health.ts` | Social |
| `src/lib/content/**`, `src/app/api/clients/[id]/post-prompt` | Split analysis/corpus collection into Social; generation and drafting into Publish |
| `src/lib/compliance/**`, `src/lib/campaigns/**`, `src/lib/verdict.ts`, `src/lib/alerts/posting-alerts.ts` | Tracking; separate execution-related alerts if mixed |
| `src/app/api/compliance/**`, `src/app/api/clients/[id]/compliance`, `src/app/api/campaigns/**`, campaign objectives settings | Tracking |
| `src/lib/reports/ops/content.ts` | Publish content-readiness report |
| `src/lib/reports/ops/posting.ts`, `src/lib/campaigns/send.ts` | Tracking posting/attainment reports |
| `src/lib/reports/ops/competitive.ts`, `intelligence.ts`, collection progress reports | Social |
| `src/app/api/report/ops`, `report/daily`, monthly/PDF reports and report orchestrators | Split by report purpose; remove cross-product sending chains |
| `src/app/(dashboard)/dashboard`, `summary`, `analytics`, `reports`, `settings`, `admin`, `logs`, `errors`, `extension` | Rebuild product-specific views; do not carry all current features into every app |
| `src/app/review/[token]`, `connect/[key]`, corresponding APIs, `src/app/r/[token]` | Inventory token purpose and owner; preserve existing links until explicit migration/exception decisions |
| `src/lib/auth.ts`, `admin-scope.ts`, `tenancy.ts`, `db*.ts`, `scoped-db.ts`, middleware | Reuse concepts with explicit per-app authorization; audit raw/system access |
| `src/lib/site.ts`, `extension-src/background.js`, `popup.js`, manifest, email/share URL builders | Replace the single-origin assumption with explicit owner origins |
| `src/lib/workspaces/**`, Streak/Sheets imports, user/workspace admin APIs | Inventory purpose, designate one owner per write operation; never run copied backfills/import jobs in all apps |

The current sidebar combines Overview, Portfolio, Publishing, System and Workspace. It must become three product-specific navigation systems.

The current schema includes networks beyond those actively implemented. Do not promise support simply because a `Platform` enum value exists. Preserve currently working integrations and document actual support per product. Section 15 explicitly adds Google Business Profile publishing to the required new Publish scope; its previous collection cleanup does not remove that requirement.

## 5. Data ownership and migration rules

| Existing model/data | Authoritative owner | Other consumers |
|---|---|---|
| `Organization`, `User`, identity mapping | One identity/tenant authority, implementation to decide | Each app enforces explicit entitlements |
| `Client` identity and `PlatformConnection` identity | Stable shared directory; recommend Social as initial directory owner | Publish/Tracking reference immutable IDs |
| `Client` CRM metadata / internal notes | Restrict by field/purpose; do not expose whole existing rows to clients | Authorized internal apps only |
| Collection connection status, collection secrets | Social | Tracking reads freshness/status without secrets |
| Publishing targets and credentials (including linked-account settings) | Publish | Tracking receives target identity, never credentials |
| `SocialPost`, `FollowerSnapshot`, collection analysis | Social | Tracking authorized read; Publish optional drafting context |
| `PostingSchedule`, `DailyCompliance`, campaign objectives | Tracking | Publish receives relevant expectations; Social may later receive a limited summary |
| `ContentItem`, `ContentComment`, `ContentMedia`, `ScheduledPost` | Publish | Tracking consumes intent/receipt snapshots and identifiers |
| `Setting`, `OrgSetting`, `SyncJob`, `AuditLog` | Split by setting/job/action purpose | No wholesale sharing of secrets or administrative visibility |

Important distinctions:
- `PostingSchedule` describes expected activity; `ScheduledPost` describes a publishing delivery. Preserve both concepts.
- Source categories currently include CLIENT, PARTNER, PROSPECT, INTERNAL, COMPETITION, COMPANY, CAMPAIGN and RECYCLED. Preserve existing values/history. Document their mapping; do not silently delete categories outside the four main requested source groups.
- Preserve organization/client/account IDs, canonical external IDs, timestamps, local-date semantics, approvals, content versions and historical evidence.
- Existing `PlatformConnection` permits one connection per client/platform. If multiple accounts are required, design and migrate this explicitly rather than assuming that client + network uniquely identifies a real account.
- Existing nullable organization IDs require an audited backfill and reconciliation before enforcing stricter constraints.

Recommended final boundary: each app has its own owned datastore/schema and credentials. A shared database is an acceptable migration bridge only with enforced app-specific roles and ownership. Three unrestricted applications writing the same tables is not the final split.

Keep one writer per dataset. Consumers use APIs/events or explicitly read-only projections. No destructive schema cleanup until all consumers and old jobs have migrated.

## 6. Integration contract requirements

The developer must define versioned schemas and document retry/error behavior before moving producers or consumers.

Common envelope: schema version, event ID, event type, organization ID, stable client ID, account ID, platform, occurred-at UTC, producer and correlation ID. The consumer validates the tenant and service permission; supplied IDs alone grant no access.

| Proposed contract | Producer → consumer | Required purpose-specific fields |
|---|---|---|
| Delivery intent created/updated/cancelled | Publish → Tracking | Scheduled delivery ID, content ID/version, target account, scheduled UTC time, state, requirement ID if known |
| Delivery attempt recorded | Publish → Tracking | Delivery/attempt ID, claimed outcome, attempt time, external post ID/URL when known, sanitized error |
| Observed post upserted | Social → Tracking | Observation ID, canonical external ID/URL, account, published UTC time, observed UTC time, collection source and evidence/freshness metadata |
| Collection health changed | Social → Tracking | Account, last successful collection, coverage window, outcome/error and staleness |
| Requirement changed | Tracking → authorized consumers | Requirement/version, account, effective dates, timezone, target/slots, exclusions and grace rule |
| Verification outcome updated | Tracking → Publish | Requirement/delivery reference, observed post reference, status, reason and verification time |

Implement idempotent consumers, durable retry or an equivalent persistent polling cursor, observable failures and a backfill path. Handle duplicate/out-of-order events using stable IDs and versions. Replaying observations must not double-count posts; replaying a delivery event must never create another publication.

Collection deduplication and publishing duplicate prevention are different controls. Preserve both. Ambiguous publish timeouts must be reconciled before retrying to avoid posting the same content twice.

## 7. Verification semantics

Maintain separate facts: expectation, delivery claim, observation and verification outcome.

Proposed display states:
- **Verified:** independent evidence matches the required account/platform/time and, for an exact deliverable, the intended post.
- **Pending:** deadline/grace window has not elapsed.
- **Missing:** deadline/grace elapsed and collection coverage is sufficiently fresh and complete to establish absence.
- **Unknown / collection stale:** evidence is insufficient, collection failed or coverage is uncertain.
- **Not required:** outside the commitment's active period or an explicit exclusion applies.
- **Failed attempt:** diagnostic fact from Publish, shown alongside verification rather than replacing it.

Rules:
1. Match by canonical external post ID/URL and account first. A text/time similarity match is a candidate requiring an explicit confidence policy, not automatic proof.
2. A generic “N posts/week” target can count eligible observed posts. An exact required content item needs identity-level matching; unrelated activity must not satisfy it.
3. A manual/external post can satisfy a frequency commitment when eligible, even without a Publish delivery record.
4. A late post remains late in historical reporting. Record later recovery without erasing the original deadline outcome.
5. Treat deleted/edited posts and later evidence changes through an auditable policy. Preserve evidence timestamps and prior outcomes.
6. Calculate local days/weeks using each requirement's timezone and defined boundary, including daylight-saving transitions.
7. Exclude monitored competitors/partners from commitments unless explicitly enrolled.
8. Show expected, verified, missing, pending and unknown counts separately. Define the success-rate denominator; unknown must not appear as verified or disappear silently.

These are proposed semantics. The developer must map existing GREEN/RED/YELLOW/GRAY statuses explicitly and retain legacy history rather than infer equivalence from color alone.

## 8. Access, authentication and extensions

- Publish and Tracking require explicit internal access, independent of being an administrator in a Social client workspace.
- Social client administrators manage only their authorized workspace. Audit authorized internal cross-client access.
- Enforce product and tenant permissions server-side on pages, APIs, exports, media, jobs and extension endpoints. Hiding navigation is insufficient.
- Use app-specific service credentials and scopes. Missing/invalid machine credentials fail closed.
- Prefer separate app sessions/cookies. If shared SSO is used, identity does not imply access to all three apps.
- Give each app its own canonical URL, OAuth callbacks, redirect allowlist, CORS policy and secret configuration.
- Keep service-to-service credentials out of client-side code. Never forward social network publishing credentials to Tracking.
- Review shared/tokenized media and review links for purpose, scope, expiry and revocation.

The current middleware exempts machine/extension paths from its session gate; route-level checks must be inspected individually. Its extension comments are stale relative to `src/lib/extension-auth.ts`, which rejects missing/unknown collection tokens. Preserve that enforcement, and test every endpoint independently.

The current database wrapper returns a raw client in an unauthenticated system context. The split must require authenticated, scoped service access; do not copy this behavior into client-facing handlers without an explicit guard.

**Extension decision:** one extension with separately scoped collection/publishing capabilities or two extensions is an implementation choice. Either way:
- A Social-only client installation cannot fetch publish jobs, publish credentials or internal Tracking data.
- Publishing commands come only from Publish; collection results go to Social.
- Bind tokens to the correct workspace and capability; never fall back to the primary workspace.
- Inventory manifest hosts, content-script bridge messages, binding, popup links, local storage, heartbeat/version routes and generated ZIP packaging.
- Stage rollout with an old-version compatibility window and an explicit retirement date.

## 9. Deployments, scheduled jobs and reports

Current observed deployment: one Cloudflare Pages project `gershoncrm-social`; pushes to `claude/social-campaign-verification-jiG5E` trigger deployment. The workflow runs `prisma db push --accept-data-loss`. Do not replicate that destructive schema step into three pipelines; use reviewed, additive migration steps with recovery procedures.

Create distinct deployment targets for the three domains, independent configuration and rollback. Provision Cloudflare Workers AI bindings wherever existing AI functionality is extracted; do not introduce a new AI provider dependency merely because of the split.

| Existing job/workflow | Proposed owner / action |
|---|---|
| `autopilot.yml`, publishing execution from `publishing-daily.yml` | Publish |
| `publish-sweep.yml` | Inspect and split delivery execution/recovery into Publish; independent observation/reconciliation into Tracking |
| `posting-alert.yml` | Tracking for missing commitments; Publish for execution failures if applicable |
| `cron-sync.yml`, collection/import/follower jobs | Social |
| `daily-report.yml`, `daily-digest.yml` | Separate collection, readiness and posting outputs; remove current cross-product report chaining |
| Campaign monthly report routes/jobs | Tracking for attainment; separate any Social analytics |
| `health-check.yml` | Product-specific health checks |
| `streak-sync.yml`, Sheets/workspace mirroring | Designate one directory/import owner after auditing data effects |

For every job, record destination host, credential scope, schedule/timezone, write ownership, retry policy and deduplication key. Fixed UTC schedules must not be described as fixed local time across daylight-saving changes.

Do not run old and new publishing schedulers simultaneously. Preserve queued work, claim state and duplicate-prevention history during cutover. Report sending must have one owner and preserve deduplication across cutover. Inventory actual configured recipients rather than copying older handoff defaults.

## 10. Migration work packages

1. **Inventory and design:** enumerate all pages/APIs/jobs/settings/models/extensions; assign ownership and identify mixed handlers. Record current data counts, queues, report recipients, domains and operational baselines.
2. **Prepare boundaries:** agree identities, account directory ownership, integration schemas, data permissions and app deployments. Create staging environments with sanitized data and publishing disabled.
3. **Extract Publish:** migrate editorial/delivery functionality and secrets; preserve review/connect links pending the exception decision. Verify scheduler ownership before activation.
4. **Extract Tracking:** move expectations and compliance; ingest delivery claims and independently collected evidence. Run reconciliation in shadow mode with notifications disabled and compare historical outcomes.
5. **Narrow Social:** retain collection/intelligence and tenant administration; remove publishing/compliance internals from both UI and API. Keep collection serving Tracking.
6. **Rehearse and cut over:** back up data; rehearse restoration; reconcile counts/IDs and pending deliveries; freeze or drain affected writers; activate one owner at a time. Update callbacks, extensions, jobs, links and reports.
7. **Retire compatibility:** after monitored stability and old-client adoption, remove deprecated routes/jobs/permissions. Delete old fields only in a later reviewed migration.

Each package needs a developer owner, estimate, dependency, migration script where needed, validation evidence and rollback procedure. Do not launch the production split until the acceptance checklist passes.

Legacy handling: existing `social.gershoncrm.com` redirects currently point page requests to Social while non-auth API calls remain served. Replace this with an explicit route-to-product compatibility map. Do not redirect legacy publishing POSTs blindly to the client Social app. Retain old APIs only with authentication, a named owner and sunset plan.

## 11. Acceptance checklist

The developer should attach test evidence for these scenarios:

- [ ] Three independent builds/deployments and distinct product navigation; no copied all-in-one application.
- [ ] Client A cannot read or modify Client B through pages, direct APIs, exports, token links or extension calls.
- [ ] Social workspace admin is denied all internal Publish/Tracking routes and APIs.
- [ ] Missing/invalid cron, service and extension credentials are refused; tenant IDs cannot be forged to change scope.
- [ ] Social collects company/client/partner/competitor posts and deduplicates a repeated import.
- [ ] Social-only extension cannot request or execute publishing work.
- [ ] Publish creates/reviews/schedules/delivers a post with approval history and media intact.
- [ ] A delivery success claim without an observation is not marked independently verified.
- [ ] A fresh matching observed post verifies the correct target; an unrelated post does not fulfill an exact content obligation.
- [ ] An eligible manually published post counts toward a frequency target.
- [ ] Missing/stale collection produces Unknown, with visible freshness; complete overdue coverage can produce Missing.
- [ ] Replayed/out-of-order events, scheduler cutover and ambiguous publish retries do not duplicate publications, evidence counts or emails.
- [ ] Local dates, weekly boundaries, active dates, exclusions, late recovery and daylight-saving cases reconcile correctly.
- [ ] Historical records, IDs, tenant associations and queued delivery counts reconcile before/after migration; orphaned records are accounted for.
- [ ] Existing review/connect/share/media links work within the agreed policy; expired/revoked links fail.
- [ ] OAuth, collection extension, generated extension ZIP, email links and cron targets use their correct product domains.
- [ ] Reports are sent once by the correct product to approved configured recipients.
- [ ] Publish outage leaves Social usable; Social outage makes Tracking evidence stale without false success or accidental retries.
- [ ] Rollback restores application/service contracts and scheduler ownership without duplicate delivery; recovery is rehearsed.

## 12. Decisions to resolve before implementation

These choices do not change the confirmed three-platform scope:

| Decision | Recommended starting point |
|---|---|
| One repository or three? | Monorepo with three deployable apps; separate later if operationally useful |
| Separate databases or transition through shared storage? | Separate ownership immediately; restricted shared schemas only as a temporary bridge |
| How do existing clients review content or connect publishing accounts? | Preserve narrowly scoped existing links temporarily; decide whether these remain explicit Publish exceptions or move to a client portal |
| Who may access which managed client in internal apps? | Explicit staff-to-client grants; no automatic “all workspaces” entitlement |
| Which commitments does Tracking measure? | Inventory existing frequency targets and exact scheduled deliverables; specify matching rules for each |
| Verification timing and late/deleted-post policy? | Define per requirement/network, with freshness-aware Unknown and an immutable discrepancy history |
| One extension or two? | Choose after capability/auth audit; client collection never grants publishing power |
| Which report recipients and delivery times? | Preserve verified current production configuration, then approve product-specific routing |

## 13. Developer deliverables

Provide:
1. A completed route/model/job ownership inventory and architecture decision record.
2. Three application entry points and deployment configurations with scoped permissions.
3. Versioned integration contracts and documented data/account ID mappings.
4. Additive migration/backfill scripts, reconciliation output, cutover and rollback runbooks.
5. Migrated UI/API features with no cross-product access leakage.
6. Extension/OAuth/legacy-link compatibility plan and retirement dates.
7. Acceptance-test evidence and a product-by-product operational handoff.

This document is the starting specification for the developer. It does not authorize or represent completed code changes, production migrations, DNS updates or deployments.

## 14. Dashboard, weekly reporting, alerting and intelligence requirements

Scope update: Olivier requested that the three new versions include the dashboard, weekly-report, alert and intelligence features discussed after the initial handoff. Treat these as implementation requirements for the new versions. Thresholds, recipients, schedules and policies identified as configurable remain setup decisions, not hard-coded assumptions.

This section extends sections 2, 6, 9, 11 and 13. It does not merge the platforms. Each product owns its dashboard, reports, alerts and intelligence. The internal executive overview is a read-only aggregation inside Social Tracking.

### 14.1 Shared product foundation

All three applications require:

- Secure login, user management and product-specific roles, with server-enforced workspace isolation.
- Consistent company/account identifiers, authorized search, filters, saved views and drill-downs.
- Dashboard filters for company, account, network, period and relevant status; Social also filters by source category.
- Clear empty, loading, unavailable and stale-data states. An unavailable metric must not display zero.
- Configurable notifications and email reports; in-app history; authorized CSV exports and printable report views.
- Audit history for changes to requirements, alert rules, report recipients, permissions and relevant operational actions.
- Visible connection health, last successful operation, evidence timestamps and actionable errors.
- Secure cross-platform exchange with no shared publishing credentials in dashboards, reports or intelligence payloads.

Every dashboard should answer four questions: what happened, what needs attention, why it matters, and what the user should do next.

### 14.2 Social — client dashboard

| Module | Required information and behavior |
|---|---|
| Collection coverage | Enabled sources, sources successfully checked, failed/stale sources, last refresh and coverage windows; drill down to source/network |
| Activity trends | Unique observed posts this week and previous comparable week, by company/client/partner/competitor and network |
| Content library | Searchable feed/calendar, original links, text/media, available engagement, topics and hashtags |
| Content performance | Strongest posts, engagement trends and follower changes, with metric availability and comparison caveats |
| Competitive comparison | Posting frequency, topics, formats and available engagement relative to selected competitors |
| Intelligence feed | Emerging themes, competitor announcements, partner news and relevant client developments |
| Recommended actions | Posts worth engaging with, subjects to address and opportunities to investigate; each linked to evidence |

Metric rules:
- Collection success means successful source checks divided by attempted source checks in the selected period; show numerator and denominator. Report unattempted enabled sources separately.
- Coverage is distinct from success: show the proportion of enabled source/account/network combinations with adequate fresh coverage.
- Compare publication periods consistently; identify late imports instead of treating import time as publication time.
- Compare engagement only for supported metrics and comparable networks/windows. Do not imply missing metrics are zero or that engagement proves business return.

### 14.3 Social — weekly report, alerts and intelligence

**Weekly client report:**

1. Reporting period, timezone, workspace and overall data coverage.
2. What changed since the previous comparable period.
3. Activity and strongest posts by source category and network.
4. Competitive themes, important announcements and emerging subjects.
5. Follower/engagement changes where supported.
6. Prioritized recommended actions with supporting post links.
7. Collection gaps, affected conclusions and next steps.

**Alert types:** collection failure or staleness; selected keywords; important monitored-source updates; unusual posting/engagement changes where there is enough baseline data.

Users can configure sources, keywords, sensitivity, recipients, channels and immediate versus digest delivery. Until adequate historical data exists, show “insufficient baseline” rather than inventing an anomaly.

**Intelligence:** summarize observed content, compare topics and formats, identify gaps and engagement opportunities, and suggest subjects for future content. Each recommendation must explain its relevance and cite authorized source posts. It may be handed to Publish as context only after explicit authorized selection or a configured integration rule; intelligence does not automatically schedule content.

### 14.4 Publish — internal dashboard

| Module | Required information and behavior |
|---|---|
| Next seven days | Scheduled content by company, target account, network and local publication time |
| Content runway | Approved, eligible content available against upcoming requirements; show shortages per company/account/network |
| Approval bottlenecks | Drafts/reviews awaiting action, overdue approvals, requested revisions and age in stage |
| Delivery health | Upcoming deliveries, claimed successes, failures and outcomes awaiting independent verification |
| Team workload | Assigned owner, deadline, unassigned work and blockers |
| Editorial balance | Topic/format/campaign distribution, repeated themes and duplicate-content warnings |
| Priority actions | Specific tasks such as “Three eligible posts needed by Wednesday,” with owner and destination link |

Runway must be computed against actual upcoming posting requirements, target compatibility and approval state. Do not divide a raw draft count by an assumed daily rate. Distinguish already scheduled coverage from approved unscheduled inventory; do not allocate one inventory item to several slots without an explicit reuse policy.

Show the approved content version and target account on scheduling/delivery views. If either changes, apply the agreed reapproval policy before delivery.

### 14.5 Publish — weekly report, alerts and intelligence

**Weekly production report:**

1. Content created, revised, approved and delivered during the reporting period.
2. Breakdown per company/account/network; define counts of content items versus network deliveries.
3. Delivery claims and independent verification outcomes as separate figures.
4. Unresolved approval, account or delivery blockers and their owners.
5. Next week's scheduled coverage and approved content runway.
6. Specific content/approval/connection actions needed, with deadlines.

**Alert types:** content below a configurable runway threshold; approaching or overdue approval deadlines; disconnected/expired publishing account; failed delivery; ambiguous delivery result requiring reconciliation; suspected duplicate.

A possible duplicate or ambiguous timeout must lead to investigation before a retry. An alert must never itself trigger a second publication.

**Intelligence:** recommend content ideas from the company brief and authorized Social insights, identify missing/overused topics, suggest refreshed content and network-specific formats/copy, and prioritize an editorial plan against campaign goals and observed results.

Apply company tone, claims restrictions, target audience and approval rules. Label generated suggestions and keep a record of source context/content version. Existing approved autopilot policy governs any automation; these features do not grant new autonomous publishing authority.

### 14.6 Social Tracking — internal dashboard

| Module | Required information and behavior |
|---|---|
| Expected versus verified | Company/account/network comparisons for day, week and month |
| Fulfillment scorecard | Expected, verified on time, late, missing, pending, unknown and excluded counts |
| Exception queue | Missing commitments, failed attempts, mismatched targets and unresolved verification |
| Evidence freshness | Last independent collection, coverage window and accounts whose evidence is insufficient |
| Recurring problems | Repeated issues by company, network, connection and publishing method |
| Resolution tracking | Assigned owner, next action, due time, issue age, acknowledgement and resolution history |
| Investigation | Requirement → content/version → attempt → independently observed post, with timestamps and links |

Keep delivery failures and duplicate warnings as diagnostic dimensions; do not double-count the associated obligation as several missed commitments.

For count-based weekly targets, calculate outstanding required units and distinguish them from exact scheduled deliverables. A single eligible observed post cannot satisfy multiple units of the same obligation. Overlapping requirement rules need an explicit allocation policy.

### 14.7 Social Tracking — weekly report, alerts and intelligence

**Weekly fulfillment report:**

- Company-by-company scorecard with expected units due, verified on time, late, missing, unknown and next action.
- Separate upcoming/pending commitments and explicit exclusions.
- Evidence links, unresolved discrepancies and affected accounts.
- Recurring operational problems, recoveries and changes from the prior comparable period.
- Responsible person and deadline for every actionable exception.

Required fulfillment definitions:
- For the set of required units due in the period, partition outcomes into verified on time, fulfilled late, missing and unknown.
- On-time fulfillment rate = verified-on-time units / total required units due. Keep unknown units in that denominator and display their count prominently.
- Eventual fulfillment rate = (verified-on-time + fulfilled-late units) / total required units due, measured as of a displayed timestamp.
- Show pending requirements outside that due-period denominator and exclusions separately. If no units are due, show “not applicable.”
- If evidence is incomplete, label the rate provisional; never present it as a final assessment of publishing performance.
- Preserve the original deadline outcome and later recovery history.

**Alert types:** commitment approaching risk; overdue/missing post with adequate evidence; unknown verification due to stale collection; wrong-account/network match; possible duplicate; recurring issue; unresolved exception escalation.

Alert messages must distinguish “commitment missed” from “unable to verify.” A healthy collection process is required before concluding absence.

**Intelligence:** use evidence across the three products to identify likely causes, including delayed approval, inventory shortage, expired connections and collection gaps. Separate measured facts from inferred causes; provide a confidence/uncertainty explanation, supporting records and a recommended remedy. It can propose an operational action but cannot execute publication.

### 14.8 Internal executive overview in Social Tracking

Provide a read-only cross-platform overview for authorized internal staff:

- Companies needing attention today.
- Next week's content readiness and approval bottlenecks.
- Posting commitments at risk and overdue.
- Collection gaps affecting verification.
- Important market opportunities from Social.
- Five highest-priority actions, each with company, reason, owner, deadline and link to the owning platform.

Recommended priority ordering is impact and deadline first, then issue age; the developer must document the ranking and make severity rules configurable. Label inferred risk and stale dependencies.

Aggregate only companies the operator is authorized to access. This overview must not introduce shared writes, unrestricted database access or publishing controls inside Tracking.

### 14.9 Weekly report delivery requirements

Deliver three focused weekly product reports plus one internal executive summary as operational support. Social Tracking's primary reporting deliverable is the monthly client work-completion report specified in section 16. Social client reports are per authorized workspace. Internal reports can consolidate authorized managed companies.

All weekly reports must include:
- Product/workspace identity; period start/end, timezone, generation time and data-as-of time.
- Comparison against the immediately previous equivalent period, with absolute changes and percentages where meaningful. A zero prior denominator must not produce a misleading growth percentage.
- Clear separation of facts, interpretation, recommendations and data gaps.
- A concise opening summary, then company-level detail and links to the owning product.
- “What changed / what is at risk / what opportunities appeared / who does what next.”
- Available archived in-app versions and an authorized printable/exportable view.

Report settings must support weekday, local send time, IANA timezone, reporting-week boundary, recipients, company scope and enable/disable. Preserve existing production reports during migration until replacements are validated; the new weekly reports do not silently cancel daily reporting.

Scheduling and delivery must belong to the applications' backend jobs, not depend on a user keeping a browser open. Persist send attempts, success/failure and retry state. Deduplicate by product, workspace/scope, report type, reporting period and intended delivery; retry only failed recipients where feasible. Manual resends must be explicit and audited.

Only configured authorized recipients receive reports. Preview/test sends must be controlled and cannot expose another workspace. No recipients or sending times are approved by this specification.

### 14.10 Alert lifecycle and noise control

Each alert record needs a stable issue key, product owner, workspace/company/account scope, type, severity, factual trigger, evidence/freshness, first/last seen time, assigned owner, next action, due time and lifecycle history.

Required controls:
- In-app notification center and configurable email delivery.
- Per-type thresholds, sensitivity, company scope, quiet hours, digest frequency, cooldown and escalation rules.
- Group repeated occurrences of one issue; notify on meaningful changes rather than every poll.
- Acknowledgement, assignment, snooze and resolution. Acknowledgement does not resolve the underlying issue.
- Resolved issues stop reminders; materially recurring issues reopen with preserved history.
- Route alerts to the responsible team without duplicate emails from multiple products.

Publish owns execution/approval/inventory alerts. Social owns collection/source intelligence alerts. Tracking owns fulfillment discrepancies. The executive summary references these records instead of creating a second alert for the same issue.

Escalation remains within configured authorized recipients. If no owner exists, display “unassigned” and route according to an explicit fallback policy; never guess a person or email address.

### 14.11 Intelligence quality and execution requirements

- Use the existing Cloudflare Workers AI integration where applicable; the split must not require additional vendor keys simply to preserve intelligence.
- Separate deterministic metrics and rules from AI interpretation. AI must not calculate authoritative fulfillment, alter evidence or assert a live post without an observation.
- Every factual insight links to supporting posts or operational records and specifies its time window.
- Suggestions identify their rationale, affected company, expected purpose, recommended action and uncertainty.
- Unsupported causal claims, fabricated engagement values and invented market events are prohibited.
- Use only authorized workspace data and permitted shared context; no cross-client information in prompts, caches or output.
- Treat collected posts as untrusted data; instructions inside them must not control the application, model permissions or downstream actions.
- Cache/version intelligence by product, tenant, period, input-data revision and model/prompt version; invalidate or label stale output when material inputs change.
- Record generation time, data coverage, model/prompt version, failure state and available feedback (“useful,” “dismiss,” “acted on”).
- If AI is unavailable, keep deterministic metrics working and clearly label unavailable insights or rule-based fallback. Never present fallback text as completed AI analysis.
- Provide rate/cost controls and scheduled/on-demand generation without blocking core dashboards.
- No autonomous outreach, content approval, requirement modification or publication is authorized by an intelligence recommendation.

### 14.12 Additional integration and persistence requirements

Extend section 6 with authorized read contracts or projections for:
- Publish readiness: eligible inventory, scheduled coverage, approval blockers, responsible owner and last update.
- Tracking requirements/risk: versioned expectations, approaching deadlines and reconciliation outcomes.
- Social intelligence: evidence-linked insights, collection coverage and generation/data timestamps.

Define persistence for report subscriptions/runs/recipient delivery attempts, alert rules/instances/history, action assignments and intelligence results. Implementation may reuse appropriate existing models; do not assume these capabilities already exist.

Shared records carry stable IDs, tenant/company scope, product owner, timestamps and schema version. Owners validate all writes. Executive aggregation uses only scoped read models/contracts.

### 14.13 Additional acceptance criteria and developer deliverables

Add these to section 11:

- [ ] Each product's dashboard includes the modules specified above and drills into the underlying authorized records.
- [ ] Filters affect cards, charts, tables, exports and reports consistently; dates and freshness are visible.
- [ ] Empty/stale/unavailable data is distinguished from genuine zero activity.
- [ ] Collection success and coverage show separate denominators; unsupported engagement metrics are not fabricated.
- [ ] Content runway respects approval, account/network compatibility and actual requirements without double allocation.
- [ ] Fulfillment partitions reconcile to required units due; late recovery, unknown, pending and exclusions are handled as defined.
- [ ] Weekly reports use the configured local period/schedule across daylight-saving changes and are delivered once per intended recipient/run.
- [ ] Report preview, archive, exports and recipient scope enforce tenant and internal/client access boundaries.
- [ ] Failed sends can retry without duplicating successful deliveries; existing daily reports remain intact until intentionally replaced.
- [ ] Repeated alert polling groups the same issue; acknowledge/snooze/escalate/resolve/reopen behavior is auditable.
- [ ] Stale collection produces an evidence alert/Unknown rather than a false missed-post conclusion.
- [ ] Intelligence links to real evidence, labels inference/data gaps and safely handles untrusted post text.
- [ ] AI failure leaves deterministic dashboards functional; caches and summaries cannot leak across clients.
- [ ] Executive overview exposes only authorized companies, shows dependency freshness and links to the owning product.
- [ ] No alert, dashboard action or recommendation bypasses approval policy or creates an automatic duplicate publication.

Extend section 13 deliverables with product dashboard specifications, a metric dictionary, weekly report templates and schedule settings, an alert rule/lifecycle catalog, intelligence prompt/evidence specifications, executive overview permissions, and validation evidence for this section.

These requirements describe the three new versions to be implemented by the developer. No application implementation, scheduled report, alert delivery or deployment is created by this documentation update.

## 15. Publish — client account access and three-network publishing setup

### 15.1 Confirmed business workflow

Olivier specified the following operating model for the new Publish platform:

| Publishing destination | How client access is obtained | Required publishing identity |
|---|---|---|
| LinkedIn | The client adds Olivier's LinkedIn user as an administrator of its company Page | Publish on behalf of the selected client company Page |
| Google Business Profile (formerly Google My Business) | The client grants Olivier's designated Google account administrative/management access to its company business profile and relevant locations | Publish for the selected client business/location |
| X / Twitter | The client provides its company account login and password; the team signs into that account | Publish as the selected client company account |

This is a user-specified workflow and implementation requirement, not a claim that all three integrations are already implemented or technically validated in this repository.

Olivier described the existing workflow as working with “cloudfare.com.” Preserve that wording as an unverified reference: the developer must identify the actual existing publishing service/integration before migrating it. Do not silently equate it with Cloudflare hosting or with CloudCampaign. This naming ambiguity must not change the requested access model or delay documentation of it.

Publishing to these three networks is required in the new Publish version. Client setup should make it clear which destinations are ready and which still need action.

### 15.2 Client publishing connections screen

For each client, provide three connection cards: LinkedIn, Google Business Profile and X.

Each card shows:
- Network, client name and selected Page/profile/location/handle.
- Stable provider target ID and a recognizable name, URL and logo/avatar where available.
- Access method and responsible internal operator.
- Setup stage, actionable failure reason, last connection check and next action.
- Separate indicators for access granted, application connected, correct target selected and publishing ready.
- Connect/reconnect, check access, change target and disconnect actions according to staff permission.
- Optional client-facing access instructions through a narrowly scoped setup link; clients do not receive general access to internal Publish.

Recommended connection states: Not configured → Access requested → Invitation pending → Access confirmed → Connection required → Ready. Expired, Access revoked and Action required are explicit blocked states. X may skip invitation stages and instead show Credentials required or Challenge pending.

A completed setup checklist is not proof of a working connection. “Ready” requires an actual successful target/permission check through the implemented publishing path, and records when/how that check was made.

Company setup supports one or more authorized targets where needed, especially Google locations. Preserve the selected stable target ID rather than relying on a company display name alone. This requires explicit design beyond the existing one-client/one-platform connection constraint.

### 15.3 LinkedIn onboarding and target validation

Required sequence:
1. Show the client's company Page and the designated operator profile. The initial business workflow uses Olivier's user; keep this configurable for future authorized staff.
2. Provide instructions for the client to grant that profile a Page administrator role that permits creating company posts.
3. Track invitation/access status and confirm the operator can access the intended Page.
4. Connect the operator's authorized LinkedIn account/session through the supported publishing integration.
5. List/select permitted company Pages; map the chosen provider Page ID to the correct internal client.
6. Verify publishing permission and persist the check result before marking the target ready.

Do not request the client's personal LinkedIn password for this delegated-admin workflow. Display which operator account is connected and which company Page will be used before scheduling. A personal profile post must never be accepted as successful delivery to a company Page.

Admin access and application/API authorization are separate checks. The developer must verify the provider role, permissions, integration eligibility and delivery mechanism against current official documentation during implementation. Do not assume that a Page admin grant by itself enables any particular API or unattended browser operation.

### 15.4 Google Business Profile onboarding and location validation

Required sequence:
1. Show the designated Google account to which the client should grant business-profile access. Do not invent an email address; configure the operator identity.
2. Track the client's grant/invitation and its acceptance, including the role available for posting.
3. Connect that Google identity through the supported publishing integration and required authorization.
4. Discover/select the authorized business profiles and locations.
5. Map each selected provider location ID to the correct client and confirm its publishing capability.
6. Mark only validated locations ready; clearly display locations requiring access, eligibility or connection repair.

Google locations are distinct destinations. The user must be able to choose which locations receive a post. Reports, retries and verification must identify the location individually.

The existing repository includes GOOGLE_BUSINESS in the schema and legacy collection-cleanup logic in tenancy code. Those facts are not evidence of a working Google publishing adapter. The developer must explicitly implement or migrate Google publishing, audit that cleanup for conflicting side effects, and preserve business/location mappings during the split.

As with LinkedIn, administrative access does not alone establish API authorization or destination eligibility. The developer must verify supported post types, account/location eligibility, permissions and integration requirements using current official documentation before implementation.

### 15.5 X / Twitter onboarding with client-provided credentials

Required sequence:
1. Record the client-approved company username/login and a reference to its securely held password.
2. An authorized operator signs into the company account in an isolated, identified account context.
3. Where the provider requires 2FA, email confirmation or another challenge, show Action required and provide a controlled operator/client completion step. Do not bypass challenges.
4. Confirm the signed-in account's stable provider ID and handle match the intended client.
5. Establish the supported publishing connection/session and validate readiness.
6. Record credential/session expiry, revocation or password-change failures and provide a reconnect flow.

Support this credential-based business workflow without exposing passwords in client tables, dashboards, reports, logs, AI prompts or documentation. Store retrievable credentials only in an encrypted secret store with scoped access; application records hold secret references and audit metadata. Use isolated sessions to prevent an account switch from causing publication to another client.

A website login is not automatically an API credential. The developer must validate the supported publishing mechanism, applicable authorization and session renewal requirements before choosing the implementation. Reuse of an existing supported integration is acceptable if it preserves the requested workflow.

### 15.6 Shared posting workflow across the three networks

- A content item can target LinkedIn, Google Business Profile and X independently or together.
- Show the exact company Page, business location or X account for every selected destination.
- Support network-specific copy/media and validate the supported content limits and post types through each adapter.
- Create a separate delivery record per selected target, including each Google location. Do not use a single success flag for the whole content item.
- Track schedule, approval version, claim/attempt history, provider result, external identifier/link where available and independent verification per destination.
- If one destination fails, preserve successful destinations and retry only the unresolved delivery after checking for possible prior publication.
- Unready/revoked targets are blocked with a clear reason. Never silently switch to a personal profile, different company Page, location or account.
- Connection/access checks must not create a public test post automatically. A live test publication requires explicit operator intent and the normal content approval/delivery controls.
- Use platform-specific statuses; provider acceptance is a delivery claim, not independent proof of a live post.

### 15.7 Dashboard, alerts and weekly-report additions

Extend the Publish dashboard with a client access/setup matrix:

| Company | LinkedIn Page | Google locations | X account | Blocker | Owner / next action |
|---|---|---|---|---|---|

For each network/target, show access state, readiness, last check and queued deliveries affected. Include counts of fully ready clients, partially ready clients, pending invitations, unresolved challenges and revoked/expired connections.

Alert on revoked access, expired authorization/session, wrong-account detection, failed permission checks and publishing deadlines threatened by incomplete setup. Deduplicate these alerts with the connection/delivery alerts specified in section 14.

The weekly Publish report must include:
- Readiness across all three networks per client.
- Access requests/invitations awaiting completion and assigned follow-up.
- Disconnected or blocked destinations and deliveries at risk.
- Delivery outcomes per network and Google location, with Tracking verification kept separate.

Client access requests/reminders are prepared or sent only through a configured, explicitly authorized workflow. This documentation update does not send messages or invitations.

### 15.8 Social and Tracking integration

Publish owns delegated publishing access, credentials and delivery execution for all three networks. Social collection credentials and company source records remain separate.

Google Business Profile publishing support does not implicitly re-enable or promise Google collection in Social. The developer must define a supported independent observation path for Google posts and other network targets before claiming verification coverage. If observation is unavailable, Tracking shows Unknown/verification unavailable rather than Verified or Missing.

Tracking receives target identity, intent, attempt receipts and independently observed evidence. It never receives client passwords, operator sessions or publishing tokens. Exact verification includes the LinkedIn Page ID, Google location ID or X account ID, as applicable.

### 15.9 Additional developer acceptance criteria

- [ ] Each client has LinkedIn, Google Business Profile and X publishing setup with actionable state and owner.
- [ ] LinkedIn delegated Page-admin access is validated separately from the publishing connection.
- [ ] LinkedIn posts target the selected company Page and cannot silently fall back to the operator's profile.
- [ ] Google delegated access, authorization, location selection and publishing readiness are validated separately.
- [ ] Multiple Google locations retain individual target IDs, deliveries, errors and reporting.
- [ ] Google publishing implementation and legacy GOOGLE_BUSINESS cleanup are reconciled without deleting valid mappings.
- [ ] X credential-based sign-in validates the company identity, isolates sessions and handles challenges/reconnection.
- [ ] Passwords/tokens are protected and excluded from logs, exports, reports and intelligence.
- [ ] Partial success across the three networks retries only unresolved targets without duplicate posting.
- [ ] Access revocation blocks affected delivery and creates an actionable, deduplicated alert.
- [ ] Independent verification is target-specific; unsupported observation remains Unknown.
- [ ] The existing service referred to as “cloudfare.com” is identified and its actual connection/credential migration is documented.
- [ ] Current provider permissions, capabilities and publishing methods are verified by the developer before implementation; no unsupported integration is represented as ready.

This section documents the requested Publish access and publishing workflow. It does not connect accounts, obtain passwords, grant Page access or implement the three publishing adapters.

## 16. Social Tracking — monthly work completion and client reporting

### 16.1 Confirmed primary purpose

Olivier clarified: “For the social tracking it is about making sure the work is done for our monthly reports.”

Social Tracking is the internal control and evidence platform for monthly client reporting. Its main workflow is: define the agreed work → monitor completion → investigate gaps → review evidence → prepare the monthly report.

Posting verification is a central source of completion evidence, within the broader question of whether the agreed client deliverables were completed. Do not imply that every client receives the same services or quantities.

This section takes precedence wherever the earlier document could suggest that weekly reporting or real-time posting monitoring is Tracking's primary purpose. Keep those capabilities as supporting operational tools.

### 16.2 Monthly scope and agreed deliverables

For each client and reporting month:
- Record the reporting period/timezone, applicable agreement or campaign, promised deliverables, quantities/frequency, eligible accounts/networks and deadlines.
- Version changes and their effective dates, including approved pauses, exclusions and scope adjustments.
- Track publishing commitments across LinkedIn, Google Business Profile and X where applicable to that client's agreement.
- Add other work categories only when they are actually agreed with the client; examples could include approved content production or another documented campaign task. Do not invent contractual obligations.
- Assign an internal owner and specify what evidence is sufficient for each type of work.

Distinguish “content produced,” “content approved,” “publication attempted” and “post independently observed.” These are separate milestones and must not be counted as interchangeable completed services.

### 16.3 Primary monthly dashboard

The default Tracking view is a selectable reporting month and authorized client portfolio.

| Module | Required purpose |
|---|---|
| Monthly completion overview | Expected, completed with evidence, outstanding, late, unknown and excluded work by client |
| Deliverables ledger | One traceable entry/unit for agreed work, owner, deadline, outcome and evidence |
| Network/account breakdown | Posting commitments and observations per LinkedIn Page, Google location and X account |
| Reporting readiness | Clients ready for review, reports blocked by evidence gaps, reviewed reports and finalized reports |
| Missing work and evidence | Actionable backlog with owner, reason, next step and due date |
| Month comparison | Like-for-like trends with explicit scope changes |
| Monthly report workspace | Review, explain discrepancies, preview, approve and export the client report |

“Report ready” means all required sections and evidence/status explanations have been reviewed. It does not mean all work was completed: an honest report documenting a shortfall can be ready. Conversely, a high posting count does not make a report ready if agreed deliverables or evidence are missing.

### 16.4 Monthly report content

Generate a separate client-scoped monthly report with:

1. Client identity, reporting month, timezone, generation time and data-as-of timestamp.
2. Executive summary: what was agreed, completed, outstanding and requiring explanation.
3. Expected-versus-completed work by deliverable category and relevant network/account.
4. Published-post register with dates, exact destination, content reference and live post links/evidence where available.
5. On-time and late completion, missing work, uncertain verification and approved exclusions.
6. Explanations for discrepancies, assigned corrective actions and recovery status.
7. Comparison with the previous comparable month, clearly identifying contract/scope changes.
8. Available engagement/follower results as supplementary outcome information; they must not replace proof that the promised work was delivered.
9. Next month's priorities and unresolved follow-up.

Quantities must reconcile from the executive totals to the underlying ledger and evidence. Never use competitor/partner posts, duplicate imports, unrelated account activity or unsuccessful attempts to inflate client delivery totals.

For frequency commitments, report the agreed frequency and its attainment as well as the total posts. Ten posts on one day must not automatically satisfy a requirement to post on ten separate days.

### 16.5 Preparation, review and finalization workflow

Recommended report states: In preparation → Evidence/action required → Ready for review → Reviewed → Finalized.

- Prepare throughout the month rather than discovering missing work only at month end.
- Provide internal notes and client-report explanations as separate fields.
- Require an authorized internal reviewer before finalization.
- Preserve a versioned snapshot of the finalized report, included metrics, period, scope and supporting evidence references.
- Later observations or recovered work update live tracking but do not silently rewrite a finalized report. Issue an explicitly revised version when appropriate.
- Provide in-app monthly report history, printable/PDF output and authorized CSV detail export.
- Keep client delivery separate from preparation/finalization. Reports are sent only through a configured, authorized delivery workflow to approved recipients.

No report generation or finalization changes the underlying publishing result or suppresses a missing-work discrepancy.

### 16.6 Monthly controls, alerts and intelligence

Alerts should prioritize:
- Agreed work at risk before its deadline or month end.
- Missing publications or other agreed deliverables.
- Evidence gaps preventing a reliable monthly report.
- Reports awaiting review or finalization near the configured reporting deadline.
- Repeated shortfalls and unresolved corrective actions.

Weekly summaries remain useful for catching problems early. Configure monthly report preparation, close/review deadlines and delivery settings independently of weekly schedules; no send date or recipients are assumed here.

Intelligence must answer:
- Which clients are at risk of not receiving the agreed monthly work?
- What is incomplete, why might it be blocked, and who should act?
- Which reporting conclusions lack sufficient evidence?
- What recurring issue should be addressed before next month?
- What factual client-facing explanation can be drafted from the records?

AI may draft narratives and identify patterns with supporting evidence. It must not certify completion, invent work, alter commitments retroactively or conceal shortfalls.

### 16.7 Ownership and implementation effects

- Publish supplies content milestones, delivery intent and attempt/receipt records for all supported publishing destinations.
- Social supplies independent observations, collection coverage and permitted outcome metrics.
- Tracking owns the agreed-work ledger, reconciliation, reporting readiness, monthly report snapshots and review history.
- Client-facing monthly report output contains only that client's permitted information, even when generated from an internal cross-client dashboard.
- Preserve and inventory existing monthly reporting before moving code. Validate its replacement against representative historical months.
- Extend the developer deliverables with the monthly dashboard specification, deliverable/evidence mapping, report template, review/finalization rules and sample reconciled monthly report.

### 16.8 Acceptance criteria

- [ ] A client/month view reconciles agreed work, completed evidence, shortfalls and exclusions.
- [ ] LinkedIn Pages, Google locations and X accounts appear individually where included in the agreement.
- [ ] Production milestones cannot masquerade as independently verified publication.
- [ ] Monthly totals drill into evidence and respect frequency/slot commitments, deduplication and scope versions.
- [ ] Stale/unavailable observation is shown as uncertainty, not invented success or confirmed absence.
- [ ] An incomplete month can produce an honest finalized report with reviewed explanations.
- [ ] Finalized report snapshots are versioned; later evidence requires an explicit report revision.
- [ ] Report previews, exports, history and distribution remain restricted to the correct client and authorized staff.
- [ ] Weekly summaries and alerts support the monthly reporting process without replacing it.

This section updates documentation only. It does not create schedules, send reports or change application code.

## 17. Social — standalone client intelligence about their business world

### 17.1 Confirmed positioning and audience

Olivier clarified that Social is a different platform for clients themselves. They can track interactions on their own posts, but its important purpose is to gather intelligence about their world: “Who is posting what.”

Social is a standalone client product, not an internal agency delivery-control dashboard or a prerequisite to buying Gershon publishing services. Clients can use it without Publish or Social Tracking.

This section clarifies the priority of sections 2 and 14: business-world intelligence comes first; own-post interaction tracking supports it. Existing collection, tenant isolation and evidence requirements continue to apply.

### 17.2 Client-defined business world

Clients manage a workspace-specific watchlist of:
- Their own company and authorized company accounts.
- Their clients, partners and competitors.
- Other relevant companies or sources they explicitly choose, where supported.

For each source, capture category, company identity, account/network URLs or IDs, relevant topics/keywords and optional priority. Let clients add, organize, pause and remove monitored sources without changing internal publishing commitments.

Provide saved watchlists, source/category filters and source-specific timelines. The same public company may be followed by several clients, but each client's watchlist, private notes, priorities and intelligence remain isolated.

### 17.3 Primary client dashboard and exploration

Make the Social landing dashboard answer “Who is posting what in my world?” through:

| Module | Client value |
|---|---|
| Business-world activity feed | Recent posts grouped/filterable by source, relationship category, network, topic and date |
| Who posted what | At-a-glance source, post subject/summary, publication time, original link and available interactions |
| What changed | New themes, announcements, activity shifts and noteworthy developments since the last comparable period |
| Intelligence highlights | Evidence-linked findings and why each could matter to the client's business |
| Recommended actions | Relevant posts to engage with, topics to investigate and opportunities for content, relationships or follow-up |
| Own-post interactions | Available reactions/likes, comments, shares/reposts, views and trends for the client's posts |
| Coverage and freshness | What was checked, when, and which sources/data are missing |

Users can move from an insight to its supporting posts, then to the individual source timeline. Search should support questions such as:
- What are our competitors talking about this week?
- Which clients announced a launch, hiring, expansion or partnership?
- What are our partners promoting?
- Which topics are gaining attention across our selected sources?
- Which of our own posts attracted interaction, and what can we learn?

Natural-language exploration is an intelligence feature where implemented; underlying search/filter access must remain usable without AI.

### 17.4 Own-post interaction tracking

For the client's own observed posts, show supported interaction counts and trends, strongest-performing topics/formats and comparisons with previous equivalent periods.

Distinguish aggregate counts from available underlying interaction details. Do not promise named reactors, comment text, impressions, clicks or private analytics unless the integration actually supplies them with appropriate permission. Show metric availability and collection timestamps.

Interaction performance is not evidence that a contractual publishing task was fulfilled. Social may explain which content attracts attention; internal delivery commitments and monthly work verification remain in Social Tracking.

### 17.5 Intelligence outputs and client actions

Produce evidence-backed outputs including:
- Source/company briefs: what a selected company has posted recently and the main themes.
- Competitive and partner summaries: topics, announcements, formats and shifts across the watchlist.
- Opportunity signals: relevant developments, posts worth responding to and potential content angles.
- Topic/keyword monitoring and changes over time.
- Side-by-side comparison of selected sources where data is comparable.

Each insight identifies who posted, what they said, when, the supporting link(s), why it may matter and a recommended next action. Clearly distinguish an explicit announcement from an inferred opportunity.

Clients can save, dismiss, organize and mark insights as acted on, with private notes. Preparing an engagement suggestion or follow-up is permitted as a feature; actual external messaging, comments or publishing require a separately authorized action and supported integration. Social is not granted automatic publishing authority by this workflow.

### 17.6 Weekly intelligence report and alerts

Lead the Social weekly client report with intelligence about the client's world, followed by their own-post interaction results and collection coverage:

1. Key developments and who is posting what.
2. Company/client/partner/competitor highlights.
3. Emerging themes and relevant opportunities.
4. Prioritized actions with original-post evidence.
5. Own-post interaction trends and learnings.
6. Sources checked, data gaps and freshness.

Allow client-configured alerts for selected companies, topics/keywords, noteworthy announcements and activity changes with an adequate baseline. Support immediate delivery for selected high-priority signals and digests for the rest, using section 14's lifecycle and noise controls.

Collection/system alerts should explain a coverage problem without overwhelming the client's intelligence feed.

### 17.7 Boundaries and acceptance criteria

- [ ] A client can onboard sources and use Social independently of Gershon's publishing service.
- [ ] The primary dashboard centers on business-world intelligence and “who is posting what.”
- [ ] Company/client/partner/competitor sources can be browsed, searched, compared and filtered.
- [ ] Insights link to source posts, identify their publication period and distinguish facts from inference.
- [ ] Own-post interactions are available as a supporting view, with unsupported metrics clearly marked.
- [ ] Client watchlists, notes, saved insights, alert rules and reports are isolated by workspace.
- [ ] No internal agency commitment dashboard, publishing credential or other client's intelligence appears in the client workspace.
- [ ] Weekly reports prioritize intelligence and recommended actions, with interaction results and coverage clearly separated.
- [ ] Suggested actions do not automatically publish, comment or contact anyone.

Extend the developer handoff with a client onboarding/watchlist flow, the intelligence-first dashboard specification, own-post interaction availability matrix and representative weekly intelligence report.
