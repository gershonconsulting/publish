# Publish (publish.gershon.ai) — status
Last updated: 2026-11-11 (v0.18.2 PR)

## v0.18.2 — no more email floods (branch nightly/2026-11-11-publish-dedupe)
Resend 2026-11-10: [PUB-202] x5, [PUB-204] x4, client [PUB-102] x2 + [PUB-101] x3, [PUB-214] x3 within minutes — each one a
different post/comment/section (one email per click), not the same email twice.
- ✅ Resend Idempotency-Key per (email no., New York day, event) on PUB-101/102/202/203/204/214 (lib/mail-dedupe.ts)
- ✅ 10-min burst window per (email, company): first email at once, later ones held (org_settings mailq:*, no migration)
  and sent as ONE by the next sweep() (lib/mail-burst.ts). PUB-101 + PUB-102 share the client's window.
- ✅ tsc clean, tests 77/77 (tests/mail-dedupe.test.mts 9/9, replays the 11-10 timeline: 5→2, 4→2, 5→3)
- ❌ Merge + deploy after Olivier's OK (version 0.18.2 sits above open PR #22's 0.18.1)

## v0.18.0 — Brand identity in the Knowledge Base (branch feat/v0.18.0-brand-kb)
Olivier 2026-11-10 (a client's remark): colour codes and related branding belong in Knowledge,
taken from the client's website or from what they shared with us.
- ✅ Knowledge Base → company → "Brand": colours (hex, name, role, picker), fonts, logo URL, brand rules, source.
- ✅ "Read from website": site HTML + first stylesheets → colours (theme-color, CSS vars, most used), fonts, logo;
  Intelligence names them; it may only return hex codes found on the site (lib/brand.ts, knowledge-base.ts draftBrandFromSite).
- ✅ "What the client shared": upload (PDF/Word/text) or paste → POST /api/knowledge-base/:id/brand-upload; wins over the website.
- ✅ Validation: a "Brand identity" section (with swatches on /kb-review); internal reviewer can correct it as text.
- ✅ Autopilot / revisions get the brand in the prompt; pictures get the brand colours as a palette hint.
- ✅ tsc clean, tests 68/68 (tests/brand.test.mts 6/6), next build OK
- ✅ Merged (#21, publish@dc34534) and deployed 2026-11-10 (social deploy/publish @deea8fe; /api/ping 0.18.0, build 33)
- ❌ "Read from website" on each client and check the colours; load brand books clients shared

## v0.16.2 — client review page shows only the external exchange
Olivier 2026-11-10: internal exchanges about a post must not be shown to the client.
- ✅ /api/review/:token filters events with lib/review-thread.ts (tests/review-thread.test.mts):
  client comments/approvals + new versions written from a client comment only.
- ✅ Clear "Your comments on this post" box per post; "Your exchange with us" above it.

## v0.16.1 — client email subject (branch fix/v0.16.1-client-email-subject)
- ✅ Every email to a client validator (PUB-101…106) has the subject
  "Gershon Consulting Publish - <Company> (<first name>) - <Month to post>" (Olivier 2026-11-10).
  Month = month the posts are for (New York). Internal emails keep [PUB-2xx]. Tests 54/54, tsc clean.
- ❌ Merge + deploy after Olivier's "ship it"

## Deploy route
Merge to `main` does NOT deploy. Deploy = add a line to `.deploy/publish.txt` on
social repo branch `deploy/publish` (workflow "Deploy sibling platform").
Check live: GET https://publish.gershon.ai/api/ping. Merges need Olivier's "ship it".

## v0.17.0 — Knowledge validation, two levels (branch feat/v0.16.0-knowledge-validation, shipped as v0.17.0)
Olivier 2026-11-10: the client must validate everything the Knowledge Base holds, by private
link like content review, after an internal check by the campaign owner (Nicolette).
1. Knowledge Base → company → "Validation": internal link (ki_…) and client link (kc_…), Copy / Open / New link.
2. /kb-review/<token> (public, token is the access): one card per section (value prop, competitive,
   each ICP, house style if written): Correct / Needs changes + comment. Internal link can also
   correct the text (saved to the KB as a manual edit, marked correct).
3. Client link answers "Almost ready" until every section passed the internal check (releasedAt).
4. A verdict is tied to the section text (fingerprint): editing a section sends it back to "To check".
5. PUB-214 to the team inbox on "Needs changes" and when a level is complete. Publish never emails the links.
Storage: OrgSetting kbval:<clientId>, kbreview_internal:<clientId>, kbreview_client:<clientId>. No migration.
Logic: lib/kb-validation-logic.ts (tests/kb-validation.test.mts 6/6); DB + mail: lib/kb-validation.ts.
- ✅ tsc clean, tests 55/55, next build OK
- ❌ Merge + deploy (needs Olivier's OK), then mint Flying Secoya links and check them live
- ❌ Nicolette reviews Flying Secoya; then the client link goes to Pauline and Charles (Olivier sends)

## v0.14.0 — posting on people's personal LinkedIn profiles (branch feat/v0.14.0-personal-linkedin)
How it works (same as Cloud Campaign "Linked Accounts"):
1. Connections → "Personal LinkedIn connect links": one private link per company
   (publish.gershon.ai/li-connect/gl_…).
2. The person (e.g. Alexandre Rouleau for Altavia) opens it, signs in on linkedin.com,
   clicks Allow. Scopes: r_basicprofile + w_member_social, on the existing
   "Gershon Social Publisher" app (Community Management API) — verified accepted 2026-11-09.
3. Publish stores the token sealed on the company (`linked:<clientId>`, `personal: true`),
   sets the company's LinkedIn destination to linkedin.com/in/<vanity>, and refuses a
   different person if the destination already points at another /in/ profile.
4. Due LinkedIn posts for that company go out through the API as that person — even
   though the workspace keeps page posts on the extension (publish_linkedin_via).
5. Tokens last ~60 days (1 year if LinkedIn gives a refresh token); expiry date shown on
   the link card and the public page.

- ✅ Code, types, build, tests 46/46
- ✅ Merged (#15) and deployed 2026-11-09
- ✅ v0.14.1: Connections, dashboard and Content counts show direct (API) connections as connected instead of "No Chrome is signed in"
- ❌ Alexandre opens his link and clicks Allow; first post verified on his profile
- ✅ PUB-213 to the TEAM (not the person) 10 days before / at expiry, with the link to forward — daily cron (lib/li-connect-link.ts remindLiExpiring, pure logic lib/li-expiry.ts, tests/li-expiry.test.mts)
- Rule (Olivier 2026-11-09): Publish never emails the person their connect link — Olivier does the sending.
- ❌ Roll out to the other person accounts (WALLIX → Jean-Noël de Galzain)

## Other open items
See the Publish project knowledge base (claude/Publish platform — knowledge base.md).
