# GitHub and Gitea issues linked to Tadooer tasks

The owner selected GitHub/Gitea issues ↔ Tadooer tasks. The first slice supports
manual import and refresh with optional close/reopen write-back. Each connection
covers one repository; credentials and host configuration remain server-owned.

The owner subsequently requested shared or repository-specific tokens. Each
connection now selects its token scope. Migration `0055_issue_shared_tokens`
adds one encrypted shared grant per owner/provider/origin, while existing
connections default to repository scope. Saving a shared replacement verifies
repository access first. Removing it preserves repository overrides, tasks,
and links, and requires authentication for active shared-scope connections.
Disconnect remains a repository operation and retains a shared grant for other
connections. Reconnect and removal use connection/grant locks to preserve
in-progress operations.

## Implementation units

1. Add shared request/response schemas and additive SQLite migration
   `0054_issue_connections`. Store encrypted grants and unique issue-to-task links.
   Import task creation and link insertion in one transaction. **Implemented.**
2. Add bounded GitHub/Gitea REST adapters and owner-authenticated routes. Detect
   text conflicts, preserve local planning data, record pending state writes, and
   reconcile uncertain outcomes after restart. **Implemented.**
3. Add Connections controls for grants, filters, selective import, project
   destination, refresh, disconnect, and explicit conflict resolution. Support
   task-ID links and preserve Host through the Vite development proxy.
   **Implemented.**
4. Verify provider behavior with synthetic responses and real temporary SQLite
   databases, drive the browser fixture, and run format, lint, type, test, and
   build checks. **Verified with the repository failure noted below.**

## Acceptance and checks

- Repeated import and restart retain one task and one link: provider lifecycle
  tests in `apps/server/src/issue-sync.test.ts`.
- Provider changes enter the ordinary task sync history while preserving
  planning fields: lifecycle tests assert client sync changes and unchanged
  estimates/planned times.
- Local edits survive refresh, and concurrent text edits require resolution:
  lifecycle and later-edit tests.
- Remote completion writes require an enabled connection setting: lifecycle
  tests and the browser fixture's disabled/enabled GitHub flow.
- A lost response or unaccepted write is reconciled without an automatic second
  PATCH: restart and explicit-retry tests.
- Provider failures, disconnect, and task deletion preserve data: failure,
  disconnect, and deleted-task tests.
- Session authentication, same-origin CSRF, configured Gitea hosts, and complete
  selections are enforced: authenticated HTTP tests.
- Browser controls import and open a linked task, and Sync writes its completion:
  `apps/server/src/issue-browser-fixture.ts`, run only with
  `SUITE_ISSUE_FIXTURE=true` in a disposable development environment. It also
  supplies synthetic DAV responses to complete first-run setup. Its issue token
  is `synthetic-issue-token`, and its repository is `fixture/issues`. No fixture
  path is selected by the release entry point.

The repository gate is `pnpm verify`. In the bounded Kuznya test container, the
equivalent steps can run with explicit worker and harness-timeout flags:
`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test --maxWorkers=2
--testTimeout=20000 && pnpm build`. The timeout is a test harness limit; provider
request deadlines stay at ten seconds.

### Verification receipt, 2026-10-11

On branch `feat/github-gitea-issue-sync`, based on
`3d99b47cdb3e14143e087a6e3c06dbe0dca7c02c`, formatting, ESLint, and all
workspace type checks passed in the isolated Kuznya test environment. The full
run completed with 236 passing tests and three failures. Two timed out during a
runner stall; a sequential rerun of all eight issue-sync tests and the Phase 9
trust-boundary test passed (nine tests total). Application deadlines and existing
tests were not relaxed.

`pnpm build` passed for web, server, MCP stdio, and quick-add. Vite reported its
500 kB chunk-size advisory; the web bundle was 516.86 kB before gzip.

The remaining assertion is in `packages/domain/src/structured-capture.test.ts`:
the fixed Friday context expects deadline `2026-08-28` but receives `2026-08-21`.
That parser, its test, and the lockfile match HEAD. The full repository gate is
therefore not green.

After the shared-token extension, formatting, lint, and workspace type checks
passed. The final changed server/UI files passed lint and type checks again after
the disconnect-state fix. The targeted issue-sync, persistence, server health,
Phase 8, and API capability inventory run passed all 34 tests, including ten
issue-sync tests. Earlier shared-token assertions caught the disconnect bug;
the repaired implementation passed both provider cases. Two existing tests
timed out during that earlier run and passed in the final sequential rerun.
The current web, server, MCP stdio, and quick-add builds passed; Vite retained its
chunk-size advisory (518.58 kB before gzip). The full repository suite was not
rerun for this extension, so the unchanged date-parser failure remains the last
full-suite result.

The browser fixture also verified shared-token save, blank-field reuse, removal,
and disconnect. Removing a shared grant left the other provider's repository
grant connected. Disconnect retained the shared grant and a later denied browse
kept the connection disconnected. Existing records without a token-scope field
appeared as repository-token connections.

The disposable browser fixture verified Gitea import, opening the linked task,
completion, and manual remote close. GitHub completion stayed local with
write-back disabled; enabling write-back allowed manual close and reopen. A
fresh preview snapshot loaded the final connection controls without horizontal
overflow. All provider requests used synthetic responses and tokens.

## Compatibility and delivery boundaries

Existing tasks retain their schema and mutation paths. The migration adds
connection/link tables without changing existing migration checksums. Backup the
SQLite database and credential key together before deployment. An older binary
expects the previous migration count; a deployment rollback needs the matching
database/key recovery point and a review of subsequent task changes.

Live provider acceptance, hosted CI, merge, deployment, and public release are
separate from local and fixture verification. This work does not enable polling,
webhooks, remote issue creation, comment/attachment sync, or delegated MCP issue
operations. The browser APIs are recorded as owner-only in the assistant
capability inventory. Maintained behavior and limits are in
`docs/operations/issue-sync.md`.

### Integration for the pull request

The original worktree was based on `3d99b47c`, before current main's schema and
UI changes. The feature checkpoint is `5a6fd80`. The PR integrates current main,
preserves its layout, startup, import, and authority changes, and appends the
issue migrations as `0054_issue_connections` and `0055_issue_shared_tokens`
(49 migrations total). The diff against main contains only the issue-sync slice.
The development proxy Host fix is already present on main. Verification of the
integrated version is recorded below separately from the earlier receipts.

Integrated verification on current main: format checking, full ESLint, and all
workspace type checks passed. The first targeted run had 110 passing tests and
two timeout failures (migration upgrade and shared-token lifecycle). Both files
passed on rerun. The five additional persistence families passed except for one
calendar-subscription timeout, whose complete file passed on a final retry.
Across these focused runs, all 135 distinct targeted tests passed in 14 files;
the issue-sync file passed all ten tests. Runs used one worker and a 20-second
harness timeout without changing application deadlines or shipped test limits.
All four application builds passed. The current main date-parser file passed
all 36 tests, superseding the old-base date assertion failure above. The complete
repository suite and hosted CI are separate, still-unverified proof states.
