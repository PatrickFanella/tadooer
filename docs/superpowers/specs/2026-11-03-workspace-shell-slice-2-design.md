# Workspace shell slice 2: the remaining routes in the new frame

Issue #196, following the first slice (#194,
`2026-11-03-workspace-shell-redesign-design.md`). Scope approved by the owner
on 2026-11-03.

## Goal

The first slice moved Today, Inbox and Tasks into the workspace shell. The
other nine routes (Planner, Boards, Habits, History, Worklog, Counters,
Reuse, Connections and Settings) render inside the frame unchanged: each
still draws its own page title under the shell header, builds its layout from
bordered cards, and keeps its own way of opening a task. This slice makes
them read as one app. Nothing here adds a server endpoint, a migration or a
contract field.

## Decisions

| Question            | Decision                                                                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page title          | The shell header's `h1` is the only page title. `PageHeader` leaves every route, Tasks included, which drew a second `h1` with the same text. Its description and actions move to `ViewIntro`. |
| Cards               | Page-level `Card` stacks on these routes and on Tasks become `ViewSection`: a `section` on `--base` with an `h2` heading row and a bottom `--line`. Rows and panels inside keep `--surface-0`. |
| Opening a task      | A task on Planner or Boards opens the shared `TaskDetailPanel` through the existing selection, the same as Today, Inbox and Tasks.                                                             |
| Planner events      | A calendar event opens the Planner's details sheet as before. An event that is a task's time block opens that task in the panel.                                                               |
| Planner after edits | Time-block changes made from the panel reload the planner window the owner is looking at, not the default seven days.                                                                          |
| Behavior            | Habits, History, Worklog, Counters, Reuse, Connections and Settings change layout only.                                                                                                        |

## Components

- `components/shell/ViewIntro.tsx`: the page's one-line description and an
  actions slot, right-aligned, stacking under 40rem. No heading.
- `components/shell/ViewSection.tsx`: `ViewSection`, `ViewSectionHeader`
  and `ViewSectionBody`, mirroring the only `Card` parts these pages use
  (`Card`, `CardHeader`, `CardContent`), so each page changes by
  substitution. Headings stay where they are: most headers already hold a
  `SectionHeading` `h2`. `ViewSection` renders a `section` and passes
  `aria-label` and `aria-labelledby` through.
- `PageHeader` is deleted once no route uses it.

## Planner and Boards

- `PlannerPage` takes `onSelectTask(task)`. Grid task entries, and events
  whose `linkedTaskId` names a loaded task, call it; other events open the
  existing details sheet. `plannerEntryTask(entry, tasks)` decides which, as
  a pure function.
- The day order rows and the unplanned drawer show the task title as a button
  that selects the task. The drawer's drag and place controls are unchanged.
- `BoardsPage` takes `selectedTaskId` and `onSelectTask(task)`. A panel row's
  title becomes a button that selects the task; the selected row carries
  `data-selected`. Move, reorder and marker controls are unchanged.
- `App` passes `selectTask` with no modifiers, so these routes select one
  task at a time. Multi-select stays on the list routes.
- `submitTimeBlock` and `removeTimeBlock` reload `state.planner.window` when a
  planner response is loaded, and the default window otherwise.

## Not included

The first slice's exclusions still apply: drag-to-reorder rows, priorities,
time spent on rows, server bulk endpoints and a router library. Components
that a page renders from elsewhere (for example the calendar bridge and
feed controls on Connections) keep their own internal markup. Replacing the
Planner's details sheet for plain events is out of scope.

## Testing

Static markup tests, as the suite does today:

- `ViewSection` and `ViewIntro` markup, including the `h2` and the absence of
  an `h1`.
- Each of the nine pages and Tasks renders no `h1` and no `data-slot="card"`
  at page level.
- `plannerEntryTask` for a task entry, a linked block event, an event whose
  task is not loaded, and a plain event.
- The day order, drawer and board rows render the title as a selecting button,
  and a selected board row carries `data-selected`.

Checks: `pnpm verify`. Screenshots of Planner, Boards and Settings at desktop
width and Planner at phone width go into `docs/design/screenshots/`, and the
design README's component rules describe `ViewIntro` and `ViewSection`.
