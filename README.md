# Publish — publish.gershon.ai

Create, approve, schedule and publish. Internal Gershon platform, one of three split out of
`gershonconsulting/social` on 2026-10-26 (spec: `docs/THREE-PLATFORM-SPLIT.md`):

| Platform | Domain | Audience |
|---|---|---|
| Publish | publish.gershon.ai | Gershon team |
| Social | social.gershon.ai | Clients (standalone intelligence) |
| Social Tracking | socialtracking.gershon.ai | Gershon team |

## Phase 1 (this version, v0.1.0)

- Own domain, own Cloudflare Pages project (`gershon-publish`), own LinkedIn sign-in app.
- Only Publish pages and APIs; product-specific menu.
- Access: signed in AND member of the Gershon Consulting (primary) workspace — enforced
  in `src/middleware.ts` on pages and API. Fails closed.
- Database: shared with Social as a temporary bridge (spec §5). This app NEVER runs
  `prisma db push`; Social remains the schema owner until the data split.
- No scheduled jobs here yet. Social keeps every cron (autopilot, publish sweep, reports)
  until cutover, so nothing runs twice (spec §9).
- No one-shot backfills/migrations in the layout (Social owns those).

## Deploy

Push to `main` here, then the deploy is run by `.github/workflows/deploy-siblings.yml`
in `gershonconsulting/social` (it holds the shared secrets): pushing branch
`deploy/publish` in the social repo builds this repo's `main` and deploys it.

## Next phases

See spec §10: own datastore, integration contracts, moving crons, extension split,
then the dashboards/reports in §14–17.
