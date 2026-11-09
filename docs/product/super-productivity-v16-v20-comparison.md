# Super Productivity v16–v20 compared with Tadooer

Reviewed November 9, 2026 against Tadooer base `2833704` and the frontend
changes accompanying this document. This is a feature comparison from source
and tests. It does not qualify a production deployment or a real-data migration.

The daily task, planning, focus and worklog workflows have substantial overlap.
The largest gaps are Super Productivity's rule-based Smart Lists, executable
plugins, additional issue providers, native mobile facilities and automatic
scheduling. Tadooer adds reusable templates, choice pools and an approval-based
assistant API. Matching the interface does not implement the missing features.

## Reference and scope

The review covers **75 published stable release entries** in the v16–v20 series,
retrieved from the [upstream releases API](https://api.github.com/repos/super-productivity/super-productivity/releases?per_page=100),
plus the v20 source tree at `4db0e11236bc784d3184a9e252930b4bd53df823`.
Some early release bodies contain only version numbers. For those releases,
the Android changelogs and source supply the useful evidence. The v19.0.0 tag
exists, but v19.0.1 explicitly rolls up changes that were not published.
Versions in the table below describe release families, not a claim that every
feature first appeared in their initial `.0.0` release.

The existing [migration parity inventory](super-productivity-parity.md) stays
pinned to its v19.1 reference and actual backup hashes. This review does not
change that import contract or claim that a v20 backup can be imported fully.

| Series | Material changes relevant to this comparison                                                                                                                                                               | Primary source                                                                                                                                                                                                                                                                                                                                                   |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 16     | Reworked scheduling and the day side panel, task placement and resizing, touch planning, and desktop idle handling.                                                                                        | [v16 Android changelog](https://github.com/super-productivity/super-productivity/blob/v16.0.0/android/fastlane/metadata/android/en-US/changelogs/1600000000.txt)                                                                                                                                                                                                 |
| 17     | SuperSync and operation-log synchronization, mobile navigation, later deadline support, and further plugin migration.                                                                                      | [v17 sync implementation](https://github.com/super-productivity/super-productivity/tree/v17.0.0/src/app/op-log), [v17.5.2](https://github.com/super-productivity/super-productivity/releases/tag/v17.5.2)                                                                                                                                                        |
| 18     | Zen visual theme, trigger/action automations, focus redesign, Flowtime breaks, local desktop REST API, more calendar and plugin APIs, worklog export and device/presence features.                         | [v18.0](https://github.com/super-productivity/super-productivity/releases/tag/v18.0.0), [v18.1](https://github.com/super-productivity/super-productivity/releases/tag/v18.1.0), [v18.5](https://github.com/super-productivity/super-productivity/releases/tag/v18.5.0), [v18.21](https://github.com/super-productivity/super-productivity/releases/tag/v18.21.0) |
| 19     | Planner and board multiselect, multiple Google accounts, numeric priorities, deletion recovery, “won't do,” repeat controls, local MCP, iOS sharing and mobile improvements.                               | [v19.0.1](https://github.com/super-productivity/super-productivity/releases/tag/v19.0.1), [v19.1](https://github.com/super-productivity/super-productivity/releases/tag/v19.1.0), [v19.2](https://github.com/super-productivity/super-productivity/releases/tag/v19.2.0), [v19.3](https://github.com/super-productivity/super-productivity/releases/tag/v19.3.0) |
| 20     | Rule-based Smart Lists, multiple tag rules and pinned views; bundled AI Command; more plugin facilities; calendar work-session logging; weekly wrap-ups; native Android capture and reminder improvements. | [v20.0](https://github.com/super-productivity/super-productivity/releases/tag/v20.0.0)                                                                                                                                                                                                                                                                           |

## Feature matrix

**Implemented** means a corresponding Tadooer workflow is present in source.
**Partial** identifies a narrower implementation or a different interaction.
**Gap** means no corresponding implementation was found. These labels describe
feature coverage, not migration completeness or native-device qualification.

### Tasks, organization and capture

| Super Productivity capability through v20             | Tadooer     | Evidence and limits                                                                                                                                                                                                                               |
| ----------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create, edit, complete and reopen tasks               | Implemented | [TaskRow](../../apps/web/src/components/tasks/TaskRow.tsx), [task actions](../../apps/web/src/components/tasks/task-actions.ts).                                                                                                                  |
| Child tasks, checklists and parent time totals        | Partial     | Two-level task hierarchy and separate checklist items. Deeper imported task chains are blocked. See [hierarchy](../adr/0018-task-hierarchy.md) and [worklog](../adr/0024-time-history.md).                                                        |
| Estimates, planned dates, planned times and deadlines | Implemented | [Planning contracts](../../packages/contracts/src/task-planning.ts), [deadline controls](../../apps/web/src/components/tasks/DeadlineFields.tsx). A planned day and a deadline remain separate.                                                   |
| Archive, restore and deleted-task recovery            | Implemented | [History](../../apps/web/src/pages/HistoryPage.tsx), [Tasks recovery](../../apps/web/src/pages/TasksPage.tsx).                                                                                                                                    |
| “Won't do” completion                                 | Gap         | The task status contract has open and completed states; no distinct outcome.                                                                                                                                                                      |
| Numeric priority and p1/p2/p3 capture                 | Gap         | Board urgency/importance markers exist, but no numeric task-priority field or equivalent capture syntax.                                                                                                                                          |
| Projects and tags with color, icon and lifecycle      | Implemented | [Organization](../../apps/web/src/components/organization/OrganizationPanel.tsx).                                                                                                                                                                 |
| Nested project/tag folders in navigation              | Partial     | Folder records and management exist in [TaskViews](../../apps/web/src/components/tasks/TaskViews.tsx); the workspace sidebar renders flat project/tag links.                                                                                      |
| Project backlog                                       | Partial     | Project backlog membership exists; no matching split-pane backlog UI.                                                                                                                                                                             |
| Fast add with project, tag, estimate and date markers | Implemented | [Add bar](../../apps/web/src/components/tasks/AddTaskBar.tsx), [capture syntax](../adr/0031-capture-syntax.md).                                                                                                                                   |
| Bulk paste and email capture                          | Partial     | Markdown and email text preview into tasks; no equivalent `.eml` file-drop workflow.                                                                                                                                                              |
| Bulk selection, status changes and moving tasks       | Implemented | [BulkBar](../../apps/web/src/components/tasks/BulkBar.tsx), [selection](../../apps/web/src/lib/selection.ts).                                                                                                                                     |
| Full-text task and note search across contexts        | Partial     | Task filters and command navigation exist; no matching global task-and-note search/reveal workflow.                                                                                                                                               |
| Link, image, file, note and app-link attachments      | Partial     | [TaskLinksPanel](../../apps/web/src/components/tasks/TaskLinksPanel.tsx) supports references and note attachments. Imported local paths remain inert; only approved HTTP(S) URLs open. No equivalent file browser or arbitrary app-link launcher. |
| Duplicate task retaining files, links and deadlines   | Gap         | No matching task-duplication action was found. Templates serve a different purpose.                                                                                                                                                               |

### Planning, views and calendars

| Super Productivity capability through v20                              | Tadooer     | Evidence and limits                                                                                                                                                                            |
| ---------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today queue, overdue work and manual day order                         | Implemented | [TodayQueue](../../apps/web/src/today-queue.tsx), [day order](../../apps/web/src/day-order.tsx).                                                                                               |
| Daily overview of estimates and tracked work                           | Partial     | Today shows planned count and estimated time. Actual tracked totals remain in Worklog rather than the Today status bar.                                                                        |
| Plan tomorrow and finish-day ritual                                    | Partial     | [PlanTomorrowPanel](../../apps/web/src/plan-tomorrow.tsx) exists. No matching finish-day or Friday wrap-up screen.                                                                             |
| Calendar time grid, overlap lanes and all-day events                   | Implemented | [PlannerTimeGrid](../../apps/web/src/components/calendar/PlannerTimeGrid.tsx).                                                                                                                 |
| Day/week/month scheduling and day side panel                           | Partial     | Day, three-day and week time grids; no month grid or persistent Schedule day side panel.                                                                                                       |
| Drag tasks to dates and board panels                                   | Partial     | Native drop targets and equivalent form controls exist. Full calendar event dragging/resizing and task-list drag reordering are not equivalent.                                                |
| Auto-plan with work hours, breaks and overflow                         | Gap         | Working-hour preferences and next-task selection exist. No equivalent automatic calendar placement/rescheduling engine.                                                                        |
| Saved sorting, grouping and filter presets                             | Implemented | [TaskViews](../../apps/web/src/components/tasks/TaskViews.tsx), [view contracts](../../packages/contracts/src/boards.ts).                                                                      |
| v20 Smart Lists, multi-tag rules, pinned rule-based views              | Partial     | A saved view has one nullable filter. Board panels have richer tag filters, but they do not implement named/pinned Smart Lists with a rule editor.                                             |
| Kanban/Eisenhower-style filtered panels                                | Implemented | [Boards](../../apps/web/src/pages/BoardsPage.tsx), urgency/importance/in-progress markers and configurable panel filters.                                                                      |
| Named task sections in contexts                                        | Partial     | Sections exist for project/tag contexts; no equivalent Today section arrangement.                                                                                                              |
| Board and Planner keyboard multiselect                                 | Partial     | List selection and board move controls exist. The planner does not match upstream's full multiselect and shortcut interactions.                                                                |
| Google Calendar                                                        | Partial     | [Google planning](../../apps/web/src/google-planning.tsx) and consented writes exist; no multiple-account selector.                                                                            |
| CalDAV/Baikal and read-only iCal feeds                                 | Implemented | [Calendar subscriptions](../../apps/web/src/components/CalendarSubscriptions.tsx), [bridge](../../apps/web/src/components/CalendarBridge.tsx). Generic plugin calendar providers are separate. |
| Bidirectional calendar bridge with explicit conflicts                  | Implemented | [Bridge semantics](../adr/0042-bridge-event-semantics.md), [bridge controls](../adr/0044-bridge-controls.md).                                                                                  |
| Log tracked work sessions as calendar events                           | Gap         | Calendar task blocks are not a work-session logging feature.                                                                                                                                   |
| Recurrence, completion anchoring, pause and overdue policy             | Implemented | [TaskRecurrence](../../apps/web/src/components/tasks/TaskRecurrence.tsx), [series contract](../../packages/contracts/src/recurrence.ts).                                                       |
| Every native-language recurrence/date phrase and newer repeat controls | Partial     | Supported recurrence rules and capture phrases are narrower; no claim of all upstream locale, nth-weekday shorthand or end-date behavior.                                                      |

### Time, focus, notes and personal records

| Super Productivity capability through v20                   | Tadooer     | Evidence and limits                                                                                                                                                                     |
| ----------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Timed work tied to a task                                   | Implemented | [Focus controller](../../apps/web/src/focus-controller.ts), [worklog](../../apps/web/src/pages/WorklogPage.tsx).                                                                        |
| Pomodoro, Flowtime, countdown and breaks                    | Implemented | [Focus settings](../../apps/web/src/focus-settings.tsx), [focus timer](../../apps/web/src/focus-timer.ts).                                                                              |
| Fullscreen focus experience and native blockers             | Partial     | Persistent focus controls and reminders exist; no matching upstream fullscreen preparation/blocker experience.                                                                          |
| Idle-time review and corrections                            | Partial     | [IdleReturnDialog](../../apps/web/src/idle-return-dialog.tsx) supports assignment/break/discard using browser idle detection. No equivalent native system-idle coverage.                |
| Worklogs by day/week/task/project and CSV export            | Implemented | [WorklogPage](../../apps/web/src/pages/WorklogPage.tsx).                                                                                                                                |
| Manual time corrections and offline time entries            | Implemented | [Local time entries](../../apps/web/src/local-time-entries.ts), [sync policy](../adr/0050-day-orders-and-time-entries-in-the-sync-feed.md).                                             |
| All upstream export options and work-start/end editing      | Partial     | CSV and daily entries exist; rounding controls and full work-start/end semantics differ.                                                                                                |
| Desktop looping alarms and optional web focus notifications | Partial     | [Focus alarm](../../apps/web/src/focus-alarm.ts) and reminder/ntfy controls exist; not all upstream channels or looping-bell options are reproduced.                                    |
| Markdown project/tag/standalone notes and pinned notes      | Implemented | [Notes](../../apps/web/src/components/notes/NoteMarkdown.tsx), [offline note sync](../adr/0046-notes-in-the-sync-feed.md).                                                              |
| Fullscreen document editor, file tree and rich note spaces  | Gap         | Markdown rendering and editing do not provide this workspace.                                                                                                                           |
| Counters and stopwatch-like records                         | Implemented | [CountersPage](../../apps/web/src/pages/CountersPage.tsx). Header counter buttons are not reproduced.                                                                                   |
| Habit records and daily evaluation history                  | Implemented | [HabitsPage](../../apps/web/src/pages/HabitsPage.tsx), [counter/evaluation records](../adr/0025-counters-and-metrics.md). Upstream removed productivity/sustainability scores in v19.3. |

### Integrations, automation and storage

| Super Productivity capability through v20                                                                 | Tadooer                          | Evidence and limits                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub/Gitea issue import, refresh and completion                                                         | Implemented                      | [IssueConnections](../../apps/web/src/components/IssueConnections.tsx), [issue provider](../../apps/server/src/issue-provider.ts). Authorized provider actions stay explicit.                                           |
| Gitea project-column moves from boards                                                                    | Implemented                      | [BoardProviderSection](../../apps/web/src/components/boards/BoardProviderSection.tsx), [ADR 0054](../adr/0054-gitea-project-columns-on-boards.md).                                                                      |
| Gitea pull requests, Jira, GitLab, Linear, Trello, Azure DevOps, ClickUp, OpenProject and other providers | Gap                              | Imported issue references are retained, but the live connectors are GitHub/Gitea issues. No equivalent PR inclusion option or additional live providers.                                                                |
| Plainspace collaboration and task handoff                                                                 | Gap                              | Tadooer has one owner; it has no shared-team task lifecycle.                                                                                                                                                            |
| Executable plugins, community catalog and custom UI/hooks                                                 | Gap                              | [ImportedPluginData](../../apps/web/src/components/ImportedPluginData.tsx) retains payloads. [ADR 0026](../adr/0026-plugin-data-and-extensions.md) explicitly provides no plugin runtime.                               |
| Trigger/action automations and plugin creation guidance                                                   | Gap                              | Assistant API commands are not a background rules engine or a plugin builder.                                                                                                                                           |
| Bundled AI Command/assistant plugin                                                                       | Partial                          | Tadooer's assistant uses scoped API/MCP operations and preview/confirmation. It has no matching in-app AI Command plugin.                                                                                               |
| Local REST/MCP and hosted ChatGPT OAuth capture                                                           | Implemented                      | [Assistant capability catalog](assistant-capabilities.md), [stdio server](../../apps/mcp-stdio/src), [hosted OAuth](../adr/0051-hosted-mcp-oauth-authorization.md). Architecture differs from a desktop-local endpoint. |
| Offline edits and synchronization across devices                                                          | Implemented                      | [LocalStore](../../apps/web/src/local-store.ts), [sync engine](../../apps/web/src/sync-engine.ts), [coverage](../adr/0053-complete-offline-feed-coverage.md). Feature-specific offline restrictions still apply.        |
| SuperSync/Dropbox/WebDAV/file/OneDrive sync and client E2EE                                               | Gap by existing product decision | Tadooer uses its own server and cache/outbox. The older parity inventory records these providers and client E2EE as excluded; this UI task does not reverse that choice.                                                |
| Active-device tracking presence and session takeover                                                      | Implemented                      | [Live sync](../../apps/web/src/live-sync), [FocusStrip](../../apps/web/src/components/shell/FocusStrip.tsx).                                                                                                            |
| Device list, persistent login and sign-out of other devices                                               | Implemented                      | [SignedInDevices](../../apps/web/src/components/settings/SignedInDevices.tsx), [trusted sessions](../adr/0048-trusted-device-sessions.md).                                                                              |
| Export/restore and migration                                                                              | Partial                          | [DataExportRestore](../../apps/web/src/components/settings/DataExportRestore.tsx), previewed Super Productivity import. No blanket v20 backup compatibility or real-data cutover claim.                                 |
| Todoist/TickTick and other plugin importers                                                               | Gap                              | No executable import-plugin system.                                                                                                                                                                                     |

### Platforms and appearance

| Super Productivity capability through v20                        | Tadooer     | Evidence and limits                                                                                                                                                                      |
| ---------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop shell, tray, quick capture and deep links                | Implemented | [Desktop shell](../../apps/desktop), [capability policy](../adr/0047-desktop-shell-capabilities.md). Native behavior is not requalified by the browser checks for this change.           |
| Desktop updates and all platform distributions                   | Partial     | [Updater](../adr/0058-desktop-updates.md) supports signed Mac updates and verified manual Linux replacement; no equivalent Windows distribution qualification.                           |
| Android shell, sharing and deep links                            | Partial     | [Mobile shell](../../apps/mobile), [ADR 0049](../adr/0049-mobile-shell.md).                                                                                                              |
| Android widgets and background WebDAV/Nextcloud reminder service | Gap         | No matching widget or provider-specific background scheduler.                                                                                                                            |
| iOS app, sharing and home-screen shortcuts                       | Partial     | [iOS shell](../adr/0056-ios-shell.md) exists. Its documented gaps include a Share Extension and native notifications.                                                                    |
| Theme choice, typography, density and custom CSS                 | Partial     | Dark/light/system palettes and shared tokens exist. No upstream theme/plugin catalog, wallpaper picker or hot-reloaded owner `styles.css`.                                               |
| Keyboard commands, help and reduced motion                       | Implemented | [Shortcuts](../../apps/web/src/shortcuts.ts), [help dialog](../../apps/web/src/components/shortcuts/ShortcutHelpDialog.tsx), reduced-motion CSS. Exact shortcut/action coverage differs. |
| Localization and natural-language parsing in many locales        | Gap         | The UI and supported capture syntax are English; no equivalent translation catalog.                                                                                                      |

## Tadooer capabilities without a direct release-series counterpart

- Reusable templates, template sets and choice pools: [ReusePage](../../apps/web/src/pages/ReusePage.tsx).
- Planning placeholders resolved from choice pools and completion history.
- Explicit authority and write-consent boundaries between Google and Baikal calendars.
- Scoped, previewable assistant operations with confirmation for consequential changes.
- Self-hosted single-owner server, browser outbox and ntfy notification delivery.

These are architectural or workflow differences, not claims of superiority.

## Interface implementation and remaining differences

The frontend follows the v20 work-view structure: a 260-pixel desktop sidebar,
64-pixel action toolbar, centered task column, flat separated rows, subdued
metadata, a tracked-task pill, quick capture and a selected-task detail column.
Small screens use bottom navigation and a modal navigation drawer. Existing
Tadooer routes remain available, including habits, templates, calendar bridge
controls and assistant settings.

Reference components:
[main header](https://github.com/super-productivity/super-productivity/blob/v20.0.0/src/app/core-ui/main-header/main-header.component.html),
[work view](https://github.com/super-productivity/super-productivity/blob/v20.0.0/src/app/features/work-view/work-view.component.html),
[task rows](https://github.com/super-productivity/super-productivity/blob/v20.0.0/src/app/features/tasks/task/_task-base.scss),
[sidebar](https://github.com/super-productivity/super-productivity/blob/v20.0.0/src/app/core-ui/magic-side-nav/magic-side-nav.component.scss).

The implementation retains Tadooer's own mark, fonts, palette and controls.
It does not copy upstream illustrations or Angular code. Missing upstream
features have no decorative buttons suggesting they work. This is a close
layout adaptation, **not a pixel-identical or complete functional clone**.
The full Schedule side panel, fullscreen focus experience, plugin surfaces,
Smart List editor and native-only features remain separate work.

See [workspace styling](../design/workspace-styling.md) for the shared controls.
