# Workspace shell redesign: frame, task row and add bar

Status: approved in conversation on 2026-11-03; the owner asked for the
recommended option at every open point. Parent issue #52. Branch
`feat/superproductivity-style-ui-redesign` on top of main `97618e3`.

## Goal

Make the web app work the way Super Productivity's desktop app does, with
Tadooer's own tokens, voice and domain: one dense task list per view, a
persistent detail panel for the selected task, the focus timer always in
view, and an add-task bar instead of a capture card. The server-backed
architecture, the local-first sync, and every existing callback stay as they
are. Nothing in this slice adds a server endpoint, a migration or a contract
field.

## Decisions taken

| Question                      | Decision                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| "Standalone"                  | Feels like a desktop app on the server-backed architecture. No serverless mode.            |
| First slice                   | Shell, task row and add bar, applied to Today, Inbox and Tasks. Other routes move unchanged. |
| Sidebar                       | Views on top; Projects and Tags groups below; Records and Setup groups at the bottom.       |
| Style                         | Existing tokens, type, density and voice. No brand asset changes.                           |
| Approach                      | New frame inside the existing `App` controller, with task callbacks grouped as `TaskActions`. |

## Scope

Included:

- `WorkspaceShell` (sidebar, header, main column, detail panel) replacing
  `AppShell`, `SidebarNav` and `TopBar`.
- `project` and `tag` context routes that render the Tasks list with a fixed
  filter.
- `TaskRow` replacing `TaskListItem` and the inline Tasks page row.
- `AddTaskBar` replacing `TaskCaptureForm` on Today, Inbox, Tasks and the
  context routes.
- `TaskDetailPanel` holding the per-task editor that the Tasks page renders
  inline today.
- Selection state, keyboard navigation and multi-select with a bulk bar,
  built on the existing shortcut registry.
- Header focus strip built from the existing `FocusPanel` timer logic.
- Tests for the new routing, selection and markup, and updates to the tests
  that cover removed components.
- Design system README updates for the new frame and row.

Excluded, with the reason:

- Drag-to-reorder rows. The native drag in the unplanned drawer stays; the
  design README records that dnd-kit waits for a reorder need.
- Priorities. No such field exists in the domain.
- Time-spent on rows. Worklog owns tracked time.
- Server bulk endpoints. The bulk bar runs the existing per-task callbacks.
- Restyling Planner, Boards, Habits, History, Worklog, Counters, Reuse,
  Connections and Settings. They render inside the new frame as they are.
- A router library. `routes.ts` grows; the app keeps `history.pushState`.

## Invariants

- Pages stay explicit-prop components. `App` owns authentication, sync,
  loading and every mutation. No global mutable UI store; selection is one
  `useState` in `App`, passed down.
- Every existing deep link keeps working: `/today`, `/inbox`, `/planner`,
  `/tasks`, `/tasks/organize`, `/tasks?task=<id>`, `/boards?project=<id>`,
  and the Records and Setup routes.
- A task keeps at most one active time block; calendar and focus actions stay
  online-only; task edits queue through the outbox exactly as they do now.
- No new tokens. Surfaces follow the current rule: sidebar on `--mantle`,
  page on `--base`, rows and panel on `--surface-0`, borders one step above.
- Reduced motion, the touch block and the phone layout contract keep passing.

## Frame

At 64rem and wider the window is a grid:

```
┌──────────┬──────────────────────────────────────┬──────────────┐
│ sidebar  │ header: view title · focus strip ·   │              │
│ 15rem    │ sync dot · command · account         │              │
│ (3rem    ├──────────────────────────────────────┤ detail panel │
│  rail    │ main column                          │ 22rem        │
│  when    │   add bar (sticky)                   │ (only while  │
│  closed) │   section heading                    │  a task is   │
│          │   task rows …                        │  selected)   │
└──────────┴──────────────────────────────────────┴──────────────┘
```

- Sidebar width 15rem; a toggle in the wordmark row collapses it to a 3rem
  icon rail. The choice is remembered per browser under
  `tadooer.sidebar:collapsed`. In the rail, items show their icon with the
  label as a tooltip; groups show their first letter.
- Header height 2.75rem, spanning the main and detail columns, on `--base`
  with a bottom `--line`.
- Detail panel width 22rem on `--surface-0` with a left `--line`, scrolling
  independently, present only while a task is selected. Closing it clears
  the selection.
- Below 64rem the sidebar becomes the existing horizontal scrolling row and
  the detail panel becomes a `Sheet` from the bottom.

The main column is `max-width: 56rem`, centred, `--spacing-page` padding.
On Today, Inbox, Tasks and the context routes it holds the add bar pinned to
the top (sticky, on `--base`), then section headings and rows. The page
title, eyebrow and description leave those four routes; the view name is in
the header. The other nine routes keep their `PageHeader` and cards.

## Sidebar

Order:

1. Wordmark row: the mark, "Tadooer", the collapse toggle.
2. Views, flat: Today, Inbox, Planner, Tasks, Boards, Habits. Today carries
   the count of open tasks planned for today (planned day or planned start
   within the planning date); Inbox carries the count of open tasks with no
   planned time. Counts come from `state.tasks` and the planning
   preferences the controller already holds; a count of zero is not shown.
3. Projects group: unarchived projects not hidden from the menu, in
   `position` order, each with its colour swatch (a 0.5rem disc in the
   project's `color`, or `--overlay-0` when null) and its open-task count.
   Each links to `/projects/<id>`. "New project" at the end navigates to
   `/tasks/organize`.
4. Tags group: same treatment, `/tags/<id>`, "New tag" to `/tasks/organize`.
5. Records (History, Worklog, Counters, Reuse) and Setup (Connections,
   Settings) exactly as issue #175 left them.

Groups keep the `tadooer.sidebar-group:<id>` storage keys and auto-open
while one of their items is current. Projects and Tags default open; Records
and Setup default closed. The sidebar footer shows only the offline notice
("Showing tasks saved in this browser") while sync is offline. The three
status badges and the Baikal chip move to the header.

## Routing

`routes.ts` keeps `workspaceRoutes` as the twelve view names and adds a
`Location` type:

```ts
type Location =
  | { readonly route: WorkspaceRoute }
  | { readonly route: "project"; readonly id: string }
  | { readonly route: "tag"; readonly id: string };
```

`locationFromPath` parses `/projects/<id>` and `/tags/<id>`; anything else
falls back to `routeFromPath` as today. `pathForLocation` is its inverse.
`App` holds a `location` state instead of `route`; a derived `route` keeps
the existing switch working, with `project` and `tag` rendering the Tasks
page. The command bar's Navigate group is unchanged and gains a Projects
group and a Tags group listing the same items as the sidebar.

A context route renders `TasksPage` with `section="list"`, its project or
tag filter fixed from the id, that one dropdown hidden, and `onOpenProjectBoards`
available. `/tasks` keeps both dropdowns and means all tasks. If the id does
not match a known project or tag, the list shows the existing `EmptyState`
with "This project no longer exists" (or tag), and the sidebar marks nothing
current.

## Header

Left to right:

- View title, `--text-lg`, weight 600. On a context route, the project or
  tag name with its swatch.
- Focus strip, centred, built from `FocusPanel`'s timer and command logic
  extracted into `focus-strip.tsx`:
  - No session: "No session" in `--subtext-2`.
  - Running: the task title (ellipsis at 20rem), the countdown in
    `--font-mono` and `--pink`, Pause and Complete buttons. A `--pink`
    1.5px underline runs the strip's width.
  - Paused: the same with Resume; the countdown in `--subtext`.
  - Break: "Break" label in `--cyan` with End break.
  - Follower: the title and countdown with "Another device controls this
    session" as a tooltip and a Take over button.
- Sync dot: one 0.5rem disc coloured by the worst of task sync, live sync and
  Baikal (green, orange, red, neutral when signed out). Hover or focus opens a
  popover listing the three states in the same words the sidebar badges use
  today. A conflict count above zero renders as a `destructive` badge beside
  the dot, since conflicts need action.
- Command bar trigger, unchanged.
- Account: a ghost button with the owner's display name opening a menu with
  Sign out. The `formError` alert renders under the header, full width, as
  it does today.

The `FocusPanel` card leaves Today. Its idle, reminder and takeover dialogs
are unchanged; they are already rendered by `App`.

## Task row

`components/tasks/TaskRow.tsx`, one component for every list. Props are the
task, its display state (`overdue`, `scheduled`, `planned-day`, `planning`,
`completed`), the planning context (`at`, `timeZone`), lookups for project
and tags, `selected`, `editing`, `focusState` (`idle`, `running`, `blocked`),
`busy`, availability flags, `actions: TaskActions`, optional
`moveControls`, optional `children` rows and the selection callbacks.

Layout, one line, 2.25rem tall, `--surface-0`, radius `--radius-md`, 1px
`--line`, 1px gap between rows:

1. Complete toggle: the `Checkbox` primitive styled round, 1rem. Completed
   rows show the title in `--subtext` with a line-through.
2. Title, `--text-base`, weight 500, ellipsis. In edit mode it becomes an
   `Input` with the same metrics.
3. Metadata in `--text-xs` `--subtext-2`, separated by " · ": planned time
   (or "Overdue" in `--orange`, "Today" for planned-day), estimate as
   "45m", deadline as "due Fri" within seven days or "due 12 Nov" beyond,
   the project as a chip with its swatch and title, then up to three tag
   chips with "+n" for the rest. Chips are `Badge` outline at `--text-2xs`.
4. Trailing actions, visible on hover, on row focus, or while selected:
   Start focus (play icon; a `--pink` "Running" badge when this task owns the
   session; disabled with a "Reconnect to start focus" tooltip offline),
   Schedule (calendar icon, opens the existing `TimeBlockForm` in a
   popover), and a "⋯" menu with Edit, Add child task, Save as template,
   Move up / Move down (when `moveControls` exists), Archive (top-level
   only, online), Delete. The menu uses the Radix dropdown primitive, added
   to `components/ui` through shadcn.

Child tasks render under the parent at one indent (1.5rem), open by default
when any exist, behind a chevron in the parent's leading edge. A child row is
the same component without the Archive item. "Add child task" opens a
single-line form under the children, as `TaskChildrenSection` does now.

Selection: clicking the row body (not a control) selects it and opens the
detail panel. The selected row has `--primary-tint` fill and a 2px
`--purple` bar on its left edge; `aria-selected` is set and the row is the
roving tab stop. Double-click or Enter on a selected row edits the title in
place; Escape cancels, Enter or blur saves through `actions.editTask` with
the other fields unchanged.

Multi-select: Shift-click extends from the anchor, Ctrl-click (Meta on
Apple) toggles. With two or more selected the add bar is replaced by a bulk
bar: "3 selected", Complete, Archive, Delete, Move to project (a
`NativeSelect` of unarchived projects plus "No project"), Clear. Bulk
actions call the per-task callbacks in sequence, stop at the first failure,
and report "Completed 2 of 3. The third did not change: <message>." in the
`formError` slot. The detail panel shows nothing while more than one task
is selected.

## Add bar

`components/tasks/AddTaskBar.tsx`. One form:

- A single `Input`, full width, 2.25rem, placeholder "Add a task. Try
  +Project #tag 30m @tomorrow 09:00", with a leading plus icon. Enter
  submits and keeps focus; the input clears on success and keeps its text on
  failure.
- A "More" toggle at the right end opens a second line: Notes, Estimate
  (defaulting from `defaultEstimateMinutes`), "Create unknown #tags".
- Markers are on by default while online (issue #184: the hint promised
  them). A small "Markers on" / "Markers off" toggle sits in the second
  line; the choice is remembered under `tadooer.capture:markers`. Offline,
  the toggle is disabled and the bar says "Offline: plain capture" under the
  input. The form still submits `structured` as the `App` handler expects.
- "Paste a list" moves to the "⋯" of the More line and opens
  `CapturePasteSection` in a `Dialog`; the link preference moves to
  Settings › Capture, which already holds the other capture defaults.

The bar is sticky at the top of the main column. `task.add` focuses it on
any list route instead of navigating to Today.

## Detail panel

`components/shell/TaskDetailPanel.tsx`. Shows the selected task and
replaces the inline editor on the Tasks page. Header: the complete toggle,
the title (editable in place, same rules as the row), a close button.
Sections, each a `SectionHeading` with the existing component under it:

1. Plan: planned day and time (`TaskPlanningForm`), the time block
   (`TimeBlockForm`), estimate and deadline (the fields from the current
   `task-edit` form). One Save button for estimate and deadline.
2. Organize: project and tags (`onSubmitTaskOrganization` form, as on
   Tasks), placement (`TaskPlacementControls`).
3. Notes: `NoteMarkdown` rendered, with an Edit toggle to a `Textarea`.
4. Child tasks (`TaskChildrenSection`) and subtasks (the checklist from
   Tasks with `onSubmitSubtask` and `onChangeSubtask`).
5. Links (`TaskLinksPanel`), Recurrence (`TaskRecurrencePanel`).
6. Footer: Start focus, Save as template, Archive, Delete; the revision and
   "Created from a reusable template" provenance line in `--text-xs`.

Sections that need a session token or an online connection render as they do
on Tasks today, including their offline notices. The panel is `aside` with
`aria-label="Task details"`; Escape closes it and returns focus to the row.

## Selection and keyboard

`App` holds `selection: { ids: readonly string[]; anchor: string | null }`.
`lib/selection.ts` exports pure functions: `selectSingle`, `toggle`,
`extendTo(order, anchor, id)`, `next(order, current)`, `previous(order,
current)`, `clear`. Each list reports its visible order to `App` through a
`onVisibleOrderChange` callback so arrow keys follow what the owner sees.

New actions in the contracts shortcut registry (group Tasks, with the
Super Productivity key where one exists):

| id                       | default   | sourceKey            |
| ------------------------ | --------- | -------------------- |
| `task.select_next`       | `Down`    | `selectNextTask`     |
| `task.select_previous`   | `Up`      | `selectPreviousTask` |
| `task.edit_title`        | `Enter`   | `taskEditTitle`      |
| `task.delete`            | `Delete`  | `taskDelete`         |
| `task.schedule`          | `S`       | `taskSchedule`       |
| `task.add_child`         | `Shift+N` | `taskAddSubTask`     |
| `task.open_details`      | `O`       | null                 |
| `selection.clear`        | `Escape`  | null                 |

`task.toggle_done` (D), `focus.toggle` (Y) and `task.add` (Shift+A) keep
their bindings and now act on the selection instead of the focused row.
Unmodified keys stay inert while an editable element has focus, as the
runtime already guarantees. `J` and `K` are not bound by default; the owner
can bind them in Settings.

## Data flow: `TaskActions`

`components/tasks/task-actions.ts`:

```ts
export interface TaskActions {
  readonly changeStatus: (task, action: "complete" | "reopen") => Promise<boolean>;
  readonly editTask: (task, patch: { title?; notes?; estimateMinutes?; deadline? }) => Promise<void>;
  readonly startFocus: (task) => void;
  readonly submitTimeBlock: (event, task) => Promise<void>;
  readonly removeTimeBlock: (task) => Promise<void>;
  readonly saveAsTemplate: (task) => Promise<void>;
  readonly archive?: (task) => Promise<void>;
  readonly remove: (task) => Promise<void>;
  readonly createChildTask: (parent, title) => Promise<void>;
  readonly moveTask: (task, parentId, index) => Promise<void>;
}
```

`App` builds one `taskActions` object from its existing handlers. The form
based `submitTaskEdit(event, task)` stays for the panel's estimate and
deadline form; `editTask` is a new thin handler that queues the same
`localStore.queueTaskPatch` with a partial patch, so the in-place title edit
does not need a form. Pages receive `taskActions` instead of the dozen
individual props; `TodayPage`, `InboxPage` and `TasksPage` signatures shrink
accordingly. Nothing else in the controller changes.

## CSS

New section "20. Workspace shell" in `styles.css` inside `@layer
components`, replacing the `.workspace`, `.sidebar*`, `.topbar*` and
`.today-task-*` rules. Row and panel rules use the tokens above. The
responsive block at 64rem is rewritten for the new grid; the 48rem and
touch blocks are unchanged. Removed rules are deleted in the same change;
`legacy` selectors that no component references are deleted after a grep.

## Phone

At 64rem and below: the sidebar row flattens views, then Projects, Tags,
Records and Setup items; group toggles are hidden. The header keeps the
title and the focus strip; the sync dot and account move into the command
bar's Workspace group. The add bar stays sticky under the header. Tapping a
row opens the detail panel as a bottom `Sheet` at 90dvh. Multi-select is
not available under a coarse pointer; the bulk bar never renders there.
The existing phone layout contract test and the touch block keep passing.

## Testing

Static markup tests, as the suite does today:

- `routes.test.ts`: `locationFromPath` and `pathForLocation` round-trip for
  every route, both context routes, and unknown paths.
- `lib/selection.test.ts`: every pure function, including extend across a
  reordered list and `next` at the end of the list.
- `components/shell/Sidebar.test.tsx`: groups, counts, swatches, current
  marking on a context route, the collapsed rail.
- `components/shell/Header.test.tsx`: each focus strip state and the sync
  dot colour for each status combination.
- `components/tasks/TaskRow.test.tsx`: each display state, selected and
  editing markup, child nesting, the menu items present per state.
- `components/tasks/AddTaskBar.test.tsx`: markers default online and
  offline, the More line.
- `components/shell/TaskDetailPanel.test.tsx`: sections present for a task
  with and without a session token.
- `app.test.tsx`: the existing cases plus a context route render and a
  selected task rendering the panel.
- Removed component tests (`SidebarNav.test.tsx`, `today-queue.test.tsx`
  cases that assert the old row) move to the new files.

Checks before the pull request: `pnpm --filter @suite/web typecheck`,
`pnpm lint`, `pnpm format:check`, `pnpm vitest run apps/web/src packages/contracts/src`,
`pnpm --filter @suite/web build`. A preview through
`t3-dev --profile productivity-suite` with screenshots of Today, a project
route and the phone layout goes into `docs/design/screenshots/` and the
design README's component rules are updated.

## Delivery

One pull request against `main` from this branch, linked to a child issue of
#52 that records this spec. Commits follow the existing style
(`feat:`/`docs:`), signed as the agent identity.
