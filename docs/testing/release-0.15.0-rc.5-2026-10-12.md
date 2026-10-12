# Release 0.15.0-rc.5 deployment, 2026-10-12

Production on nuc now runs `0.15.0-rc.5` from `main` at
`490b7e706aa2de28d5792d914e3fa19be9539ca8`. It replaces `0.15.0-rc.4`
(`09d86f0`, deployed 2026-10-11 and recorded here after the fact) and applies
migrations 50 to 52 to the owner's database.

## Owner instruction

On 2026-10-12 the owner said: "let's get it deployed and I will test it live
with a key." The release carries everything merged since `09d86f0`: the UI
notes work (#167 to #173), the information-architecture pass (#175), the
static landing page (#176), and Gitea project columns on boards (#174, ADR
0054), which the owner will qualify against git.subcult.tv with a real token.

## Identity

| Item           | Value                                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Version        | `0.15.0-rc.5`                                                                                                                     |
| Image          | `127.0.0.1:5000/subculture-collective/productivity-suite@sha256:4e0ee526e96ed1a11c0117bd2ad7cc7107550252462cc766ede8d8cd25df9a9e` |
| Built          | On Kvant from `git archive 490b7e7`, `SUITE_VERSION=0.15.0-rc.5`, 2026-10-12T23:07:24Z; loaded on nuc and pushed to its registry  |
| Manifest       | `deploy/releases/0.15.0-rc.5-490b7e7.json`; nuc release directory `/srv/apps/productivity/releases/20261012-0.15.0-rc.5-490b7e7`  |
| Previous image | `…@sha256:17ce97bbc39a86c279d7d7288fba98042cdc214ac8da036a3f4be2e0ef04692c` (`0.15.0-rc.4`), kept on nuc and in the registry      |
| Migrations     | 49 before, 52 after (`0054_complete_readonly_feed_coverage`, `0056_board_project`, `0057_board_provider_mappings`)                |
| Desktop        | rc.3 artifact reference retained; no native package rebuilt or distributed                                                        |

## Evidence before cutover

- Hosted `verify` on PR 187 (`171da8d`, the last change in this release) passed; main `490b7e7` is its merge.
- Local `pnpm verify` on Kvant for `490b7e7`: format, lint, typecheck, 1,276 tests in 243 files, builds, all passed.
- `nuc-prepare.sh` wrote the documented online backup `backups/20261012T231012Z` (checksums ok), a Baïkal copy (integrity ok, 237 calendar objects), per-table fingerprints and `SHA256SUMS` under `before/`.
- `nuc-verify-backup.sh` restored the set into network-less containers: the previous image served it with 49 migrations and changed nothing; the new image served it with 52 migrations, adding the empty `board_provider_mappings` table, a null `boards.project_id` column (two boards, counts unchanged), and resetting the sync feed epoch (`sync_changes` 9,885 to 0, new `sync_owner_state` row content) as ADR 0053 specifies. Integrity ok, no foreign-key violations.

## Deployment

`nuc-deploy.sh` stopped `suite`, fingerprinted the database, wrote
`before/suite-stopped.tar.gz`, set `SUITE_IMAGE` to the digest, ran
`docker compose up -d --wait`, checked `/api/build` and `/api/ready` over the
public origin (version, revision, instance id `9bd1fe75…`, 52 migrations),
compared post-deploy fingerprints (changed: `boards`, `calendar_collections`,
`client_identities`, `schema_migrations`, `sync_changes`, `sync_owner_state`;
all expected), promoted the stable channel, recorded `deployment.json` and
`tadooer-release.json`, and restarted once to prove restart recovery. The
container started at 23:11:48 UTC and is healthy with zero restarts.

## Verification after deployment

- `/api/build`: `0.15.0-rc.5`, `490b7e7…`. `/api/ready`: ok, 52 migrations, `calendarBridge idle`. Metrics: `suite_database_migrations 52`, expected 52. Web index 200.
- New routes answer `401 AUTH_REQUIRED` unauthenticated: `/api/boards/{id}/provider`, `/api/issue-connections/{id}/projects`.
- Post-deploy backup `backups/20261012T231221Z`, checksums ok. Integrity ok, 0 foreign-key violations, 5,836 tasks and 2 boards before and after, 0 board provider mappings, 0 issue connections.
- Baïkal untouched and healthy. Existing browser sessions take a fresh sync snapshot because of the feed epoch reset; sign-in state is unaffected.
- Not exercised: a live Gitea project sync. The owner's next step is to connect a repository with a project under Connections, attach it to a board, and run "Sync from Gitea"; record the result on #174.

## Rollback

Restore the previous image and the pre-upgrade stopped snapshot together; the
previous image does not serve a 52-migration database. Commands are in
`/srv/apps/productivity/releases/20261012-0.15.0-rc.5-490b7e7/ROLLBACK.md`.
A rollback discards changes made after the stopped snapshot; take an owner
export first.
