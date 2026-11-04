# Content reset temporary-storage capacity, 2026-11-04

The integration-preserving reset in PR #210 rolled back on production rc.11
(`b727166`) when clearing 92,305 content rows, including 7,609 tasks. No reset
generation committed; all tasks and 81 evaluations remained present. The
pre-reset coherent backup passed checksums, SQLite integrity and foreign-key
checks. It stays on NUC with the paired credential material; production data
and keys are not test fixtures in this repository.

## Reproduction

The persistence reset and full API confirmation both succeeded against a
private backup copy on Kvant. Repeating the API confirmation with the exact
production image isolated the deployment constraint:

| Temporary filesystem            | Confirmation | Result                                   |
| ------------------------------- | ------------ | ---------------------------------------- |
| No writable temporary directory | 500          | SQLite disk I/O error                    |
| Read-only root, 16 MiB `/tmp`   | 500          | `SQLITE_FULL` (database or disk is full) |
| Read-only root, 128 MiB `/tmp`  | 200          | All 92,305 content rows cleared          |

The image was run on NUC with `--network none`; all connector fetches were
also replaced with rejecting functions. The reproduction used a disposable
database copy and a synthetic token. Debug output was enabled only in the
private reproduction bundle. The production bundle, token authority and
live data were not modified for diagnosis.

A nested savepoint needs temporary rollback storage for this large atomic
operation. The 16 MiB mount is too small even though the data volume has
space. The reset error can be masked by a subsequent rollback error after
SQLite has automatically rolled back the transaction.

## Change and validation

Raise only the bounded `/tmp` capacity to 128 MiB in the production Compose
configuration and the release helper's isolated restore rehearsal. Keep the
read-only root, non-root user, dropped capabilities, no-new-privileges
setting and confirmation transaction unchanged. The writable database
volume remains the database and WAL destination.

The successful 128 MiB API confirmation used the existing rc.11 image;
no application-code change was needed. Deployment must install the matching
Compose capacity and release helper, then verify the live mount and repeat
the approved reset through the automation API. Do not patch the live
SQLite database or disable the reset's savepoint to work around capacity.

Post-reset inspection of the successful isolated copy found zero tasks,
evaluations, projects, tags, plugin records and recurring series. Account,
Baikal/Google grant rows, two calendar providers, 17 calendar collections,
11,741 saved calendar event projections, the calendar feed and planning and
notification preferences matched the backup exactly. SQLite integrity was
`ok` with zero foreign-key violations.
