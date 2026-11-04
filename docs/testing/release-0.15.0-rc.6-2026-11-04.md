# Release 0.15.0-rc.6 deployment, 2026-11-04

Production on nuc now runs `0.15.0-rc.6` from `main` at
`e81ecea7f34f6e43de4460952f4079709cb0d6f1`. It replaces `tadooer:seo-f59bafc`,
which was rc.5 (`490b7e7`) with the October 14 SEO metadata overlay, and
applies migration 53 (`0058_calendar_feed_visibility`) to the owner's database.

## Owner instruction

On 2026-11-03 the owner merged PR #199 and asked to deploy. The release carries
everything merged since rc.5: the workspace shell (#194, PR #195; #196,
PR #199), busy-only calendar feeds (#189, PR #198, ADR 0055), the
private-planner SEO metadata (PRs #190 and #191, which the overlay image had
carried) and GPL-3.0-or-later licensing (PR #192).

## Identity

| Item           | Value                                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Version        | `0.15.0-rc.6`                                                                                                                     |
| Image          | `127.0.0.1:5000/subculture-collective/productivity-suite@sha256:ed9e6b7cbf6428588618c8b3067be4c65fdc79008153adc41dc6357682d7dcbb` |
| Built          | On Kvant from `git archive e81ecea`, `SUITE_VERSION=0.15.0-rc.6`, 2026-11-04T01:54:13Z; loaded on nuc and pushed to its registry  |
| Manifest       | `deploy/releases/0.15.0-rc.6-e81ecea.json`; nuc release directory `/srv/apps/productivity/releases/20261104-0.15.0-rc.6-e81ecea`  |
| Previous image | `tadooer:seo-f59bafc` (image `sha256:2efc9829…`), kept on nuc; its base is rc.5 `…@sha256:4e0ee526…`                              |
| Migrations     | 52 before, 53 after (`0058_calendar_feed_visibility`)                                                                             |
| Desktop        | rc.3 artifact reference retained; no native package rebuilt or distributed                                                        |

## Evidence before cutover

- Hosted `verify` passed on PR #199 (run 18037, `c4d22fa`) and on its merge to main (run 18039, `e81ecea`).
- Local `pnpm verify` on Kvant for the PR #199 head: format, lint, typecheck, 1,334 tests in 252 files, builds.
- `nuc-prepare.sh` wrote the documented online backup `backups/20261104T015527Z` (checksums ok), a Baïkal copy (integrity ok, 237 calendar objects), per-table fingerprints and `SHA256SUMS` under `before/`.
- `nuc-verify-backup.sh` restored the set into network-less containers. The previous image served it with 52 migrations and changed nothing. The new image served it with 53 migrations; the only differences were the migration record and `calendar_feed_capabilities`, whose one existing feed gained `visibility = 'full'` and a null `identity_salt`. Integrity ok, no foreign-key violations.

The rc.5 scripts were copied and changed in three places: the previous image is
the SEO overlay tag, the expected migration count is 53, and the table allowed
to change shape is `calendar_feed_capabilities` instead of `boards`.

## Deployment

`nuc-deploy.sh` stopped `suite`, fingerprinted the database, wrote
`before/suite-stopped.tar.gz`, set `SUITE_IMAGE` to the digest, ran
`docker compose up -d --wait`, checked `/api/build` and `/api/ready` over the
public origin (version, revision, instance id `9bd1fe75…`, 53 migrations),
compared post-deploy fingerprints (changed: `calendar_collections`,
`calendar_feed_capabilities`, `schema_migrations`; all expected), promoted the
stable channel, recorded `deployment.json` and `tadooer-release.json`, and
restarted once to prove restart recovery. The deployment was recorded at
01:56:05 UTC; the container is healthy with zero restarts.

## Verification after deployment

- `/api/build`: `0.15.0-rc.6`, `e81ecea…`. `/api/ready`: ok, 53 migrations, `calendarBridge idle`. Metrics: `suite_database_migrations 53`, expected 53. Web index 200.
- The served bundle `/assets/index-4d6iAhY6.js` contains the new shell and feed strings (`view-intro`, `task-title-button`, "Open details for", "Busy only").
- The new owner route `/api/calendars/{id}/feed-preview` answers 401 unauthenticated.
- Post-deploy backup `backups/20261104T015623Z`, checksums ok. Integrity ok, 0 foreign-key violations, 53 migrations, 7,523 tasks before and after, 1 calendar feed before and after (still full details).
- Baïkal untouched.
- Not exercised: a signed-in browser session on production, creating a busy-only feed against the real Baïkal calendar, or a subscription from a real calendar client.

## Rollback

Restore the previous image and the pre-upgrade stopped snapshot together; the
previous image does not serve a 53-migration database. Commands are in
`/srv/apps/productivity/releases/20261104-0.15.0-rc.6-e81ecea/ROLLBACK.md`.
A rollback discards changes made after the stopped snapshot; take an owner
export first.
