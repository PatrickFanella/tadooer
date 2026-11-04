# Current development and release checkpoint

Recorded November 3, 2026, from `main` at `026bc6f`, the Gitea issue list and a
read of the production `/api/build` and `/api/ready` endpoints. This is the
single current checkpoint; phase notes, release records under `docs/testing/`
and execution plans keep the dated history. The repository is
[subculture-collective/tadooer](https://git.subcult.tv/subculture-collective/tadooer)
and its default branch is `main`.

## Production

Production on NUC runs `0.15.0-rc.5`, source `490b7e7`, with 52 migrations.
On November 3 `/api/build` reported that version and revision, and `/api/ready`
reported `ok`, current migrations and an idle calendar bridge. The deployment,
backup, restore rehearsal and rollback are recorded in
[release-0.15.0-rc.5-2026-10-12.md](testing/release-0.15.0-rc.5-2026-10-12.md).
This pass did not sign in, check provider freshness or read the backup ledger.

`main` has moved past rc.5 with web, contract and documentation changes only:
the private-planner SEO metadata (PRs #190 and #191), GPL-3.0-or-later
licensing (PR #192) and the workspace shell redesign (#194, PR #195). No server code or
migration changed, so a new candidate needs no schema step. PR run 17884 and
main run 17991 passed; the local gate passed 1,319 tests in 248 files.

## Stable release

[#21](https://git.subcult.tv/subculture-collective/tadooer/issues/21) still
describes the September 20 soak of `0.14.1-calendar` (`a6983dc`, 19
migrations). Production has since moved through `0.15.0-rc.1` to `rc.5`, so
that soak does not cover the running build. Its disposition is an owner
decision recorded on
[#37](https://git.subcult.tv/subculture-collective/tadooer/issues/37). Elapsed
time alone never qualifies `1.0.0`; workflow evidence, backup and restore, the
absence of qualifying failures and sign-off remain required.

## Open work

| Workstream                       | Open issues and next step                                                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Release and cutover              | #21 soak and stable release, #37 next candidate, #49 reviewed migration cutover from Super Productivity.                                                                                                                                         |
| Super Productivity parity        | The parity matrix (#17) and its child slices are closed. #31 and #32 remain open as epics; #47 qualifies a full import of the real history and reconciles real workflows. Additional import adapters (#51) follow.                               |
| Calendar hub                     | Bridge implementation (#35, #36, #40, #45, #46, #48) is closed and tested against fake providers and disposable Baikal. #50 qualifies Google and both Baikal modes with real accounts. #189 adds a busy-only mode to existing calendar feeds.    |
| Assistant access                 | Hosted OAuth (#34), confirmation policy (#33) and installed Codex/Claude clients (#39) are closed. #43 delivers the hosted MCP transport; #193 is a smaller capture-only hosted endpoint. Embedded subscription runtimes (#44) stay conditional. |
| Workspace UI                     | The first shell slice (#194) is on `main` but not deployed. #196 proposes bringing Planner, Boards, Habits, History, Worklog, Counters, Reuse, Connections and Settings into the new frame. #176 tracks the landing page.                        |
| Multi-device sync (#112)         | Waves 7A and 7B are closed. Open: device sessions #115, desktop apps #116, mobile #117 (Capacitor Android shell in `apps/mobile`, [ADR 0049](adr/0049-mobile-shell.md)) and live-sync qualification #118.                                        |
| Installation and releases (#136) | Eighteen issues, #137 to #154, in milestones: automated server setup, desktop releases and device hosting, hosted sync without a home server, Google-backed app data, Android, iOS, and a final installation and platform matrix.                |
| Decisions                        | #26 multi-user scope, #52 improvements after parity, #102 extension runtime.                                                                                                                                                                     |

## Earlier plans

[The architecture/frontend audit](product/legacy-plan-reconciliation.md)
separates implemented work from residual tasks; its follow-ups #74, #75 and
#76 are closed. Old line-count targets and proposed filenames are not release
gates.
