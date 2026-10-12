---
status: accepted
---

# Gitea project columns on boards

Issue #174, following ADRs 0005, 0021 and 0028. Decided 2026-10-12.

A board can be attached to one Gitea project in a repository the owner has
already connected for issue import (ADR 0021). Each board panel can map to one
project column. Linked tasks follow their issue's column: a sync run moves a
task into the panel whose column holds its issue, through the same previewed
board move as the Move button, with the move's change list applied as usual.
Write-back is opt-in per mapping: when it is on, moving a task into a mapped
panel also moves its issue into that column after the local move succeeds.

## Direction of authority

Gitea is the preferred provider; the owner asked for two-way sync and accepted
one-way. The provider column is the authority for a linked task's panel
placement at sync time, with one exception: a task that was changed locally
after the last sync and sits in a different mapped panel is not moved. It is
reported as a conflict with the issue, the column and the reason, and nothing
is written on either side until the owner moves it. This matches ADR 0005: no
implicit two-way mirror. The owner resolves a conflict by moving the task (with
write-back on, that also moves the issue) or by moving the issue in Gitea and
syncing again.

Write-back runs after the local move has committed. A failed provider write
keeps the local move, records the failure on the mapping, and the next inbound
sync surfaces the divergence as a conflict instead of silently moving the task
back. The move preview names the provider effect before anything is applied.

## Scope

- One mapping per board, one project per mapping, one column per panel. Panels
  without a column are untouched by sync.
- Only issues already linked to tasks are considered. Sync never imports.
- Gitea only in this slice. GitHub Projects v2 uses a GraphQL field model and
  is deferred until the Gitea mapping has run against git.subcult.tv.
- Sync is manual (a button and an endpoint). A worker can follow the calendar
  bridge pattern (ADR 0043) once the manual path has been used in production.
- Provenance: an inbound move writes a message on the issue link ("Moved to
  panel X from Gitea column Y at T"), shown in Connections. A task-row badge is
  a follow-up.

## Data and endpoints

Migration `0057_board_provider_mappings` adds `board_provider_mappings`
(board, owner, connection, JSON record), cascading with the board and the
connection. Endpoints: `GET /api/issue-connections/{id}/projects` lists a
Gitea repository's open projects and their columns;
`GET|PUT|DELETE /api/boards/{id}/provider` manages the mapping;
`POST /api/boards/{id}/provider/sync` runs one inbound pass and returns the
moves, conflicts and the refreshed board view. The board move endpoint gains an
optional `provider` effect in its response, planned on a dry run and applied or
failed afterwards.

## Limits recorded at decision time

The client code is exercised against the Gitea API shapes published by
git.subcult.tv (API 28.0.0 swagger) through a fake fetcher. A live run against a
real project needs the owner's connection token inside a running instance; it
is recorded in the issue when done, and GitHub work waits for it.
