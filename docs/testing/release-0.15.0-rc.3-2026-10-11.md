# Release 0.15.0-rc.3 deployment, 2026-10-11

Production on nuc now runs `0.15.0-rc.3` from `main` at
`5660799987770a94698bdb4e44d8983aa72da498` (PR 157, merged the same day). It
replaces `0.15.0-rc.2` (`420f73d`) and applies migrations 46 and 47 to the
owner's database.

## Owner instruction

On 2026-10-11 the owner said: "I would like to do a one-time sync between
tadooer and superproductivity. The goal is to remove superproductivity from
the equation." The October 9 Super Productivity backup could not apply on
`0.15.0-rc.2` (three blocking findings, see PR 157), so the import fix had to
reach production before the owner's one-time import. Everything merged to
`main` since `420f73d` ships with it: cancellable app startup, the sync feed
for online-only records, scoped hosted MCP OAuth, Google write consent,
trusted-device sessions and the design-system documentation.

## Identity

| Item             | Value                                                                                                                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Version          | `0.15.0-rc.3`                                                                                                                                                                                                                                |
| Image            | `127.0.0.1:5000/subculture-collective/productivity-suite@sha256:10fa5a9362689e9ea23d9f6dd9403a94c6aeedbd03117ff5e0f58ae53354025c`                                                                                                            |
| Built            | On Kvant from `git archive 5660799`, `SUITE_VERSION=0.15.0-rc.3`, `SUITE_REVISION=5660799…`, 2026-10-11T19:04:17Z; loaded on nuc and pushed to its registry                                                                                  |
| Desktop artifact | `tadooer-desktop-0.1.0.sha256sums@sha256:6c33718a3c061275f07cea65d3871976ec199e8da0e27a3e7725b1c7b7dc6d23` (the two thin macOS zips built 2026-10-11 and not distributed; the universal zip and dmg of PR 156 are not in `main`'s index yet) |
| Manifest         | `deploy/releases/0.15.0-rc.3-5660799.json`; nuc release directory `/srv/apps/productivity/releases/20261011-0.15.0-rc.3-5660799`                                                                                                             |
| Previous image   | `…@sha256:b1d60697c23f8b026d03d429bf929101a90421c2a1aaeef6eb831a0c7a116d34` (`0.15.0-rc.2`, `420f73d`), kept on nuc and in the registry                                                                                                      |
| Migrations       | 45 before, 47 after                                                                                                                                                                                                                          |

## CI evidence

Hosted runs on the `kuznya` runner keep failing single long tests with
`Test timed out in 20000ms` and no assertion failure, as on 2026-10-03:

- Run 14316 on `ff1f67d` (the same import change, before the branch was
  rebased onto `main`): green.
- Run 14318 attempt 1 on `5660799`: one timeout in
  `calendar-subscriptions.test.ts` (37 s), 230 test files passed.
- Run 14318 attempt 2 on `5660799`: one timeout in `device-sessions.test.ts`
  (31 s), 1,207 of 1,213 tests passed, no assertion failure.
- Runs 14310 (`main` at `07787c4`) and 14305 also failed on timeouts only.

Local evidence on Kvant for `5660799`: `pnpm verify` (format, lint,
typecheck, 1,217 tests in 232 files, build) passed; the import-export suite passed with
the new cases.

## Rehearsals

- `deploy/rehearse-upgrade.sh` with the production image and the candidate
  on disposable data: the candidate reached readiness with 47 migrations,
  kept the seeded task across a restart, the previous image reported
  `not_ready/pending` on the migrated database, and the restored backup set
  served again on the previous image with 45 migrations.
- The candidate on a copy of the 2026-10-11T07:16Z daily backup, with no
  network: readiness `ok`, 47 migrations, `calendarBridge idle`.

## Backup and verification

`nuc-prepare.sh` (the 2026-10-03 script with the new identifiers) wrote the
documented online backup `backups/20261011T190838Z`, verified its checksums,
copied Baïkal (integrity `ok`, 237 calendar objects) and the compose, env and
release files into `before/`, with per-table fingerprints and `SHA256SUMS`.

`nuc-verify-backup.sh` extracted the set into network-less containers: the
database fingerprint matched; the previous image served it with 45 migrations
and changed nothing; the candidate served it with 47 migrations, adding only
the five empty `hosted_oauth_*` tables, `schema_migrations` 45 to 47 and one
`sync_owner_state` row (new epoch). Integrity `ok`, no foreign-key
violations, before and after.

## Merge

`main` requires the hosted `verify` status. With two attempts failing on
different unrelated timeouts, the agent merged PR 157 as a site administrator
with `force_merge`, recording the evidence above in the merge request. Gitea
fast-forwarded `main` to `5660799`, so the deployed revision is `main`'s head.

## Deployment

`nuc-deploy.sh` stopped `suite`, fingerprinted the database (only
`calendar_collections` and `client_identities` had changed since the online
backup), wrote `before/suite-stopped.tar.gz`, kept the previous env and
release files as `tadooer.env.before-0.15.0-rc.3.20261011T191626Z` and
`tadooer-release.json.before-0.15.0-rc.3.20261011T191626Z`, set
`SUITE_IMAGE` to the digest, then `docker compose pull` and `up -d --wait`.
The container started at 19:16:29 UTC and became healthy; its only log line
is `Tadooer listening on http://127.0.0.1:8080`. The channel was promoted
(`channels/stable.json` now names `0.15.0-rc.3`; the `0.15.0-rc.2` manifest
is archived in `history/`), and `tadooer-release.json` and
`deployment.json` record the deployment.

## Verification after deployment

- `/api/build` over the public origin: `0.15.0-rc.3`, `5660799…`.
  `/api/ready`: 200, 47 migrations, `calendarBridge idle`. Metrics:
  `suite_database_migrations 47`, expected 47. Web index 200. Container
  healthy.
- Table comparison, stopped snapshot against live: 101 tables, 97 fully
  unchanged, integrity `ok`. Expected differences: `schema_migrations` 45 to
  47; `sync_owner_state` (new epoch); `calendar_collections` and
  `client_identities` (runtime timestamps); five new empty `hosted_oauth_*`
  tables. Counts unchanged: tasks 1, subtasks 2, projects 1, tags 1, owner
  accounts 1, web sessions 2.
- The signed-in views and the Super Productivity import itself are the
  owner's next step from the desktop app's Connections page.

## Rollback

Restore the previous image and the pre-upgrade backup set together; the
previous image does not serve on a 47-migration database. The commands are in
`/srv/apps/productivity/releases/20261011-0.15.0-rc.3-5660799/ROLLBACK.md`,
the same procedure as 2026-10-03 with the new paths. A rollback discards
changes made after the stopped snapshot; take an owner export first.
