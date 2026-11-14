# Publish (publish.gershon.ai) — status
Last updated: 2026-11-14 (v0.18.5 on main: PRs #25, #26, #24, #27 merged in the night push)

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
