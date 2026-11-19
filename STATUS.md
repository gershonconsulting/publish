# Publish (publish.gershon.ai) — status
Last updated: 2026-11-19 (v0.22.0 merged on Olivier's "ship it")

## v0.22.0 — semi-autopilot, working days only, @company tag (Olivier 2026-11-19)
- ✅ Autopilot mode "semi" (default): the written month stays DRAFT; ONE PUB-216 email per company/month to the team
  with a link to its Content & review; the team sends it to the client ("Send for review"). "Full" = old behaviour
- ✅ Working days only: Autopilot plans Mon–Fri; scheduleItem moves any Sat/Sun post to Monday same NY time;
  runway slots capped at 5/week; Intelligence "Fill the gap" skips weekends; Autopilot objective 7 → 5
- ✅ Existing weekend posts (daily Autopilot step): moved to the next free weekday; unseen Autopilot/Intelligence
  drafts with no free day that week are deleted (≤40 per run)
- ✅ @company: tag added when a post is sent for review (reviewer sees it), when Autopilot/Intelligence write it, and
  at scheduling; never on the company's own page/X account. LinkedIn API → real mention when the page number is known
  (Connections → company → "Company tag"); browser route → plain "@Name" text
- ✅ tsc clean, tests 114/114, next build OK
- ❌ Set Altavia's tag: LinkedIn page number + X handle (Alexandre posts as himself → Altavia tagged)


## v0.21.0 — Weekly connections report PUB-215 (Olivier 2026-11-19: "Warning of lack of connections weekly by email to report")
- ✅ Every Monday (New York) the daily cron emails report@gershonconsulting.com (env CONN_REPORT_TO overrides):
  per company 🔴 not connected / expired / stopped working, 🟠 posts elsewhere / expires ≤14 days / no destination, 🟢 OK; + this week's connection changes
- ✅ Once per Monday (OrgSetting conn_report_week + Resend Idempotency-Key); LinkedIn groups = extension only, not a gap
- ✅ Preview: GET /api/publishing/conn-report (?format=html); send now: cron POST ?connReport=1
- ✅ lib/conn-report-model.ts (pure, 8 tests), lib/conn-report.ts; no schema change; tsc clean, 117/117, build OK

## v0.20.0 — Connection history per company (Olivier 2026-11-17: "I don't know when these pages were disconnected")
- ✅ Every change to a company's direct connections (LinkedIn page, personal LinkedIn, X) is logged with date + who:
  connected / reconnected / disconnected / stopped working / working again / expired / page changed
- ✅ Store: OrgSetting `connlog:<clientId>` (plain JSON, no tokens, last 300 events); hook in saveLinked (lib/conn-log.ts)
- ✅ Expiries nobody saves are written by the daily cron and on every read, dated at the real expiry
- ✅ Before today: current connections logged with their own connect date ("reconstructed"); "last post through the
  connection" and "last failed post" shown as proof of when it last worked
- ✅ UI: company Connections → "Connection history"; All connections → one line per company (latest LinkedIn/X event)
- ✅ GET /api/publishing/conn-log[?clientId=]; tests 109/109 (after main 0.19.3 merge), tsc clean, next build OK
- ✅ 2026-11-18 merged PR #31 (main db37aba, approved by Olivier "All 10"); npm ci, tsc clean, 109/109, build OK; deploy line 12:48Z → live 0.20.0 at 12:51Z (ping commit e80c822). No schema/migration step (OrgSetting JSON only)
- ❌ Past disconnections (before 2026-11-17) were never recorded — only the evidence above can date them

## v0.19.3 — one PUB-203 / PUB-204 per burst (nightly 2026-11-18)
- ✅ Resend 2026-11-17: [PUB-203] Altavia x4 in 2 min to social@ → now ONE email (held on arrival, sent when quiet 10 min, cap 60 min), like PUB-202
- ✅ PUB-204 also held on arrival (2026-11-10 x4 replay: 2 → 1); same Idempotency-Key per (post version, comment)
- ✅ Recipients: team inbox only (alertEmail / social@gershonconsulting.com); client emails unchanged
- ✅ tsc clean, tests 101/101, npm run build OK
- ✅ v0.19.2 went live 2026-11-18 02:5xZ (build 42, social@7a2250b) after a 2nd deploy line; the 02:21Z request (build 41) never went live

## v0.19.2 — clickable Connections (Olivier 2026-11-17)
- ✅ X + personal LinkedIn connect cards: company name → its Connections; account → x.com / linkedin.com/in profile; connect link shown as a link
- ❌ Duplicate "Amphasys Bioprocessing" (created 2026-11-16, 0 posts, not connected) next to "Amphasys" (52 posts, @Amphasys + Markus connected) — archive only on Olivier's OK

## v0.19.1 — Connections split (Olivier 2026-11-17)
- ✅ Picked company → Connections shows only that company: its LinkedIn/X lines with ✅/❌, its personal LinkedIn + X connect links
- ✅ "All connections" (every company, Chromes, your pages, API) moved to Workspace, above Intelligence
- ✅ tsc clean, tests 97/97, next build passes

## v0.19.0 — clickable links to published posts (Olivier 2026-11-17)
- ✅ Client dashboard: "Published" card — every post that went out in the window, newest first, "Open on LinkedIn/X"
- ✅ lib/published-links.ts: post URL → X status id → page/profile it was posted on; "Link not recorded" otherwise
- ✅ "Went out" tile jumps to the list; tsc clean, tests 97/97, next build OK

## v0.18.6 — Resend retry (PR #28, merged 2026-11-16)
- ✅ lib/resend-send.ts: every Resend send retries network/429/5xx 3x (1s/4s/10s) with the same Idempotency-Key; 4xx not retried; final failure logged
- ✅ tsc clean, tests 92/92, next build passes
- ✅ Merged 2026-11-16 (publish@d9775cd); deploy requested via social deploy/publish (see /api/ping for the live version)

## v0.18.5 on main — merged 2026-11-14 (Olivier 03:24 ET: "Do them, release them. I test tomorrow")
- ✅ #25 v0.18.3: no more "<!DOCTYPE … is not valid JSON" — lib/api-call.ts callApi() retries once on HTML/429/5xx,
  then a plain sentence; POST /api/publishing/content idempotent (10 min); picture upload always replace=true
- ✅ #26 v0.18.4: a burst of PUB-202 validations = ONE email (flush only when quiet 10 min, cap 60 min;
  lone validation held; batches / notify-ready go at once; deleted posts drop their held rows)
- ✅ #24 email templates in brand red (#FE1B04 / #d11200 / #fff5f5)
- ✅ #27 v0.18.5: colour leftovers in the app UI -> brand red; LinkedIn blue only on LinkedIn icon/badge/buttons
- ✅ Checks on the merged result: npx tsc --noEmit clean, npx tsx --test tests/*.test.mts 88/88
- ❌ Not confirmed: Cloudflare-side root cause of the HTML answers (no Pages logs access)
- ❌ Olivier tests: load Amphasys posts (no JSON error), validate several posts (one PUB-202), colours in app + emails

## Deploy route
Merge to `main` does NOT deploy. Deploy = add a line to `.deploy/publish.txt` on
social repo branch `deploy/publish` (workflow "Deploy sibling platform").
Check live: GET https://publish.gershon.ai/api/ping (version + build).

## v0.18.2 — email floods (live before this push? check /api/ping)
- ✅ Resend Idempotency-Key per (email no., NY day, event) on PUB-101/102/202/203/204/214 (lib/mail-dedupe.ts)
- ✅ Burst grouping per (email, company) in org_settings mailq:* (lib/mail-burst.ts), no migration

## v0.18.0 — Brand identity in the Knowledge Base (live 2026-11-10, build 33)
- ✅ KB → company → "Brand": colours, fonts, logo, rules; "Read from website"; client upload wins over website
- ❌ "Read from website" on each client and check the colours; load brand books clients shared

## v0.17.0 — Knowledge validation, two levels
- ✅ /kb-review/<token> internal (ki_) then client (kc_) links; PUB-214 on "Needs changes"; no migration
- ❌ Mint Flying Secoya links and check them live
- ❌ Nicolette reviews Flying Secoya; then the client link goes to Pauline and Charles (Olivier sends)

## v0.16.x — client review page / client email subject
- ✅ Client review page shows only the external exchange (lib/review-thread.ts)
- ✅ Client emails PUB-101…106 subject "Gershon Consulting Publish - <Company> (<first name>) - <Month>"

## v0.14.0 — posting on personal LinkedIn profiles
- ✅ Person connect link + PUB-213 to the team before expiry (daily cron); Publish never emails the person
- ❌ Alexandre opens his link and clicks Allow; first post verified on his profile
- ❌ Roll out to the other person accounts (WALLIX → Jean-Noël de Galzain)

## Other open items
Full history: HANDOFF.txt and git log. Project knowledge base: claude/Publish platform — knowledge base.md.
