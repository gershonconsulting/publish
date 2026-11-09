# Publish (publish.gershon.ai) — status
Last updated: 2026-11-09 (v0.14.0)

## Deploy route
Merge to `main` does NOT deploy. Deploy = add a line to `.deploy/publish.txt` on
social repo branch `deploy/publish` (workflow "Deploy sibling platform").
Check live: GET https://publish.gershon.ai/api/ping. Merges need Olivier's "ship it".

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

- ✅ Code, types, build, existing tests (43/43)
- ❌ Merge + deploy (needs Olivier's "ship it")
- ❌ Alexandre opens his link and clicks Allow; first post verified on his profile
- ❌ Expiry reminder email (PUB-1xx) 10 days before a personal connection expires
- ❌ Roll out to the other person accounts (WALLIX → Jean-Noël de Galzain)

## Other open items
See the Publish project knowledge base (claude/Publish platform — knowledge base.md).
