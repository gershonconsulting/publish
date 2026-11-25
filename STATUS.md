# Publish (publish.gershon.ai) — status
Last updated: 2026-11-25 (v0.28.0 review link = sent posts only; deleted days stay empty)

## v0.28.0 — Altavia feedback (Olivier 2026-11-25)
- ✅ Review link shows only the posts of the email (batch / post); bare link = waiting posts + their batch. No "other posts" toggle, never PUBLISHED/PARTIAL posts (lib/review-focus reviewScope, applied in /api/review/:token)
- ✅ Deleting a planned post records its NY day in org_settings skip_days:<clientId>; Autopilot (coveredDays), Fill the gap (fillGaps + gaps list) skip it — holidays no longer refilled (lib/skip-days*.ts)
- ✅ tests 172/172, tsc clean, next build OK; no schema change
- ❌ Days deleted BEFORE v0.28.0 are not remembered — delete those posts once more
- ❌ No UI yet to "release" a kept-empty day (releaseDays exists) — a post created by hand on that day works anyway

## v0.27.0 — the client chooses the picture (Olivier 2026-11-25: "Give us the option to load 3 pictures for the client to validate")
- ✅ Post panel → "Let the client choose": load up to 3 pictures (files), or "Let the client choose among these 3" from the picture options
- ✅ Review link: "Choose the picture for this post" with 3 pictures; the chosen one becomes the post's picture (others dropped), logged in the thread
- ✅ Approve blocked until a picture is chosen; "Approve all" approves the others and says how many still need a picture choice
- ✅ Pictures to choose count as "the picture" for Send for review (requireImage)
- ✅ Stored in org_settings pic_choices:<postId> (no schema change); public bytes at /api/review/<token>/picture/<post>/<id> (token-scoped)
- ✅ lib/picture-choices-model.ts (pure, 5 tests); tests 168/168, tsc clean, next build OK
- ❌ Pexels: new API keys paused by Pexels (2026-11-25) — v0.26.0 runs on Openverse + AI fallback

## v0.26.0 — 3 picture options per post, real photos first (Olivier 2026-11-25: "not satisfied with the pictures … offer the user 3 options of as less as possible AI generated pictures … the user will select one before submitting for validation")
- ✅ Post panel → "Choose the picture (3 options)": 3 cards, each labelled Real photo · <source> (credit + licence link) or AI-generated; "3 others"; own search words
- ✅ Sources best first: Pexels (only if env PEXELS_API_KEY) → Openverse StockSnap/rawpixel CC0 (shorter searches) → Openverse Flickr/Wikimedia (commercial use) → Workers AI only for empty slots. Logos/stickers/vectors skipped
- ✅ Options kept in org_settings pic_options:<postId> (no schema change); choice logged on the post with the credit
- ✅ Autopilot semi mode + Fill the gap: no AI picture attached any more — the 3 options are prepared, the team picks before "Send for review" (requireImage still blocks review without one). Team email says so
- ✅ No one to choose (Autopilot auto mode, client asks for another picture): best real photo attached, AI only as last resort
- ✅ lib/picture-options.ts (pure, 8 tests), lib/picture-options-db.ts, API /api/publishing/content/:id/picture-options; tests 163/163, tsc clean, next build OK
- ❌ Without a Pexels key the real-photo choice is thin for niche topics (biotech, cyber) → AI fills; add PEXELS_API_KEY to the Pages project


## v0.25.2 (was PR #40 v0.23.2) — client review emails show the posts; new subject (Olivier 2026-11-23)
- ✅ "No content in the email!": PUB-102 (batch) and PUB-103 (Autopilot month) listed only titles like "10-12" → now each post's day (New York) + full text (lib/publishing-mail postsDigestHtml)
- ✅ Subject = "Publish by Gershon.AI - <Company (First name)> - <Month YYYY>" (was "Gershon Consulting Publish …")
- ✅ tests 138/138, tsc clean, next build OK; no schema change
- ❌ social repo has an identical publishing-mail.ts (old subject) — align it next time Social is touched

## v0.25.1 — review link = the posts of the email (Olivier 2026-11-24, Amphasys PUB-102 December: "Les posts affichés … ne correspondent pas aux posts sélectionnés pour review")
- ✅ Cause: /review/<token> listed every post of the company (60 for Amphasys) with the old "October 2026" batch (26 posts, still IN_REVIEW) on top; "Approve all" approved all 38 waiting posts
- ✅ Emails now link to /review/<token>?batch=<name> (PUB-102, PUB-103) or ?post=<id> (PUB-101; grouped PUB-101s drop it). Page shows only those posts, others behind "Show the other N posts"; Approve all sends the ids shown
- ✅ API reads waiting posts (take 300) separately from history (take 100) — a batch can no longer fall off the list
- ✅ lib/review-focus.ts (pure, 7 tests); tsc clean; no schema change
- ❌ Amphasys: 26 posts of "Amphasys — October 2026" still IN_REVIEW with November dates already passed — decide: withdraw or keep

## v0.25.0 — weekly feature status PUB-217 (Olivier 2026-11-24: "Send the status of all features to social@ … Red started, Orange pending validation, Green done weekly")
- ✅ Every Monday (New York) the daily cron emails social@gershonconsulting.com (env FEATURE_STATUS_TO overrides): 🔴 started · 🟠 pending validation · 🟢 done (NEW = changed in last 7 days; greens >30 days folded into a count)
- ✅ Once per Monday (OrgSetting feature_status_week + Resend Idempotency-Key). Preview: GET /api/publishing/feature-status (?format=html); send now: cron POST ?featureStatus=1
- ✅ RULE: update src/lib/feature-status-data.ts in the SAME commit as any feature work (state + since date) — the email is only as true as that list
- ✅ lib/feature-status-model.ts (pure, 4 tests); no schema change

## v0.24.1 — no weekend publishing, any client (Olivier 2026-11-24: "We don't publish content during week-ends for any clients")
- ✅ Working days only is no longer a setting — always on (scheduleItem, Autopilot plan, Fill the gap)
- ✅ Weekend cleanup (clearWeekends) runs for EVERY company each Autopilot step, Autopilot on or off
- ✅ Sweep moves any SCHEDULED delivery on Sat/Sun (NY) to Monday, same time, before publishing (moveWeekendDeliveries)
- ✅ API route and extension never publish on Sat/Sun NY; "Retry" on a weekend waits for Monday
- ✅ weekend-off tests 3/3; no schema change

## v0.24.1 — Calendar: posts are clickable (Olivier 2026-11-24: "The posts are not clickable on the calendar view") ✅
- Each post line inside a day box on /publishing/calendar opens the post panel directly (before, the day box was one button that only selected the day).
- Day box is now a div role=button (no nested buttons); Enter/Space still selects the day.

## v0.24.0 — real @company tag on the browser route (Olivier 2026-11-24, option "2")
- ✅ /api/extension/publish/due sends `segments` for LinkedIn posts carrying the company tag (lib/company-tag.ts liSegments, 3 tests)
- ✅ Extension 0.3.0: pastes the plain pieces, TYPES "@Name", picks the company in LinkedIn's suggestion list → real tag; no suggestion → plain "@Name", post still goes out; 3rd try = old plain paste
- ✅ Result reports `tags`; the post history says "tagged (linked to the page)" or "stayed plain text"
- ✅ tsc clean, tests 138/138, next build OK (public/publish-extension-v0.3.0.zip); no schema change; older extensions ignore `segments`
- ❌ Extension folder on Olivier's computer (publish-chrome-extension) must get the 0.3.0 files — self-update then reloads it
- ❌ First live LinkedIn post through the browser: check the tag is a link (LinkedIn's suggestion list selectors are a best guess)

## v0.23.1 — monthly client email ONCE per client per month (nightly 2026-11-20, HOLD: client-facing)
- Resend: arouleau@altavia.co got 4 emails "Gershon Consulting Publish - Altavia (Alexandre) - November 2026":
  11-17 19:53Z PUB-103 (month, 10 posts) · 11-18 18:01Z PUB-105 (new v4) · 18:24Z PUB-101 (same v4 again) · 19:23Z PUB-103 AGAIN
- ✅ Cause 1: autopilot submitMonth() had no "sent" marker + random Idempotency-Key → every step that found new month drafts re-sent PUB-103
- ✅ Fix: org_settings `monthly_sent:<YYYY-MM>:<clientId>` claimed atomically before sending (released on failure) + Resend Idempotency-Key `publish-monthly-<clientId>-<YYYY-MM>` (lib/monthly-once.ts, monthly-once-db.ts)
- ✅ Cause 2: a version already announced by PUB-105 was announced again by PUB-101 → marker `client_announced:<item>@<version>#<pictures>`; a new picture still notifies
- ✅ tests 135/135 (monthly-once 10/10 reproduces the 2x PUB-103), tsc clean, next build OK; no schema change
- ❌ Not merged / not deployed — on Olivier's OK list. Posts Autopilot adds to an already-announced month are on the same review page, no second month email

## v0.23.0 — Knowledge links for every client (Olivier 2026-11-19: "Complete the knowledge Base for everyone… share a dedicated link to all clients so they can validate")
- ✅ Workspace → Knowledge links (/knowledge-links): one line per company — empty sections, client progress, client link (copy/open), "Copy all client links"
- ✅ "Fill empty sections" drafts missing parts with Intelligence (overwrite:false — never replaces written text); style/brand retried alone so their reason shows
- ✅ Client link can be opened without the internal check: POST /api/knowledge-base/links {release:"all"|clientId}, POST …/<id>/validation {release:true}; state.releasedBy recorded; internal link keeps working
- ✅ GET /api/knowledge-base/links; Validation tab shows "Still empty" + "Open the client link now"
- ✅ Brand from websites ignores WordPress/Bootstrap/test colours and icon fonts (FRAMEWORK_COLORS, isIconFont)
- ✅ No schema change (OrgSetting JSON); tsc clean, tests 125/125, next build OK
- ❌ Writing style needs the company's pre-takeover posts in social.gershon.ai; brand needs a readable website — companies without either stay incomplete until the client shares material

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
