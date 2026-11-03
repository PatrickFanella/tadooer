# Workspace Shell Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the card-stacked web shell with a desktop-style frame (sidebar with contexts, header with the focus strip, task list, detail panel), one `TaskRow`, one `AddTaskBar`, keyboard selection and a bulk bar, applied to Today, Inbox and Tasks.

**Architecture:** `App` keeps every mutation and passes a grouped `TaskActions` object and a `selection` state down as props. New shell components under `components/shell/`, row and add bar under `components/tasks/`, pure selection and routing helpers under `lib/` and `app/`. The other nine routes render inside the new frame unchanged.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Tailwind v4 with the existing token layer, shadcn primitives on `radix-ui`, Lucide, Vitest with static markup (`renderToStaticMarkup`; no DOM environment).

**Spec:** `docs/superpowers/specs/2026-11-03-workspace-shell-redesign-design.md`. Issue #194.

## Global Constraints

- No new design tokens; use `--mantle`, `--base`, `--surface-0`, `--surface-1`, `--line`, `--purple`, `--pink`, `--cyan`, `--orange`, `--primary-tint`, `--text-*`, `--radius-*`, `--motion-*`.
- No server endpoints, migrations or contract fields except the shortcut registry rows the spec lists.
- Pages remain explicit-prop components; selection is `useState` in `App`.
- Every existing deep link keeps working; `/tasks?task=<id>` still filters and now also selects.
- Tests are static markup plus pure functions; no `@testing-library`, no jsdom.
- Copy follows the design README voice: short present tense, no exclamation marks.
- Keep `100dvh`, `env(safe-area-inset-*)` and the touch block; `phone-layout.test.ts` must pass.
- Every new CSS rule sits in `@layer components` (or the existing touch block).
- Commits as the agent identity; messages `feat:`, `docs:`, `test:`.

## Review Focus

1. A context route for an id that no longer exists (archived project, deleted tag): the list shows the empty state with "This project no longer exists" and nothing in the sidebar is current. Test in Task 3.
2. Keyboard selection when the visible order changes under the cursor (a completed task leaves the list): `next` from a removed id starts at the first row rather than throwing. Test in Task 4.
3. `Enter` while editing a title must save, not re-enter edit; `Escape` must restore the old title. The reducer in Task 7 is tested for both transitions.
4. Bulk action with a failure in the middle: the message names how many changed and the first failure, and the selection keeps the unchanged ids. Test in Task 11.
5. The add bar offline: `structured` is never submitted and the bar says "Offline: plain capture". Test in Task 8.

---

### Task 1: Shortcut registry rows

**Files:**

- Modify: `packages/contracts/src/application-preferences.ts` (append to `shortcutActions`)
- Test: `packages/contracts/src/application-preferences.test.ts`

**Interfaces:**

- Produces: action ids `task.select_next` (ArrowDown), `task.select_previous` (ArrowUp), `task.edit_title` (Enter), `task.delete` (Delete), `task.schedule` (S), `task.add_child` (Shift+N), `task.open_details` (O), `selection.clear` (Escape); group `"Tasks"`; sourceKeys `selectNextTask`, `selectPreviousTask`, `taskEditTitle`, `taskDelete`, `taskSchedule`, `taskAddSubTask`, null, null.

- [ ] **Step 1: Add a test** in the existing describe: `it("binds selection and editing actions")` asserting `shortcutActions.find(a => a.id === "task.select_next")?.defaultBinding === "Down"` and the same for the seven others, and that `normalizeShortcutBinding("Down")`, `("Enter")`, `("Delete")`, `("Escape")` return themselves.
- [ ] **Step 2: Run** `pnpm vitest run packages/contracts/src/application-preferences.test.ts`; expect failure on the find.
- [ ] **Step 3: Append the eight rows**; if `normalizeShortcutBinding` rejects a named key, extend its key allow-list rather than the test.
- [ ] **Step 4: Run** the file; expect pass, including the uniqueness test.
- [ ] **Step 5: Commit** `feat(contracts): register selection and editing shortcuts`.

### Task 2: Selection helpers

**Files:**

- Create: `apps/web/src/lib/selection.ts`, `apps/web/src/lib/selection.test.ts`

**Interfaces:**

- Produces:

  ```ts
  export interface Selection { readonly ids: readonly string[]; readonly anchor: string | null }
  export const emptySelection: Selection
  export const selectSingle = (id: string): Selection
  export const toggle = (s: Selection, id: string): Selection
  export const extendTo = (s: Selection, order: readonly string[], id: string): Selection
  export const next = (s: Selection, order: readonly string[]): Selection
  export const previous = (s: Selection, order: readonly string[]): Selection
  export const retain = (s: Selection, order: readonly string[]): Selection  // drops ids no longer visible
  export const primaryId = (s: Selection): string | null  // the one id when exactly one is selected
  ```

- [ ] **Step 1: Write tests**: `selectSingle` sets anchor; `toggle` removes an existing id and clears the anchor when it was that id; `extendTo` selects the inclusive range in `order` regardless of direction and keeps the anchor; `next` from empty picks `order[0]`, from the last id stays on it, from an id not in `order` picks `order[0]`; `previous` mirrors; `retain` drops missing ids; `primaryId` is null for 0 or 2 ids.
- [ ] **Step 2: Run** `pnpm vitest run apps/web/src/lib/selection.test.ts`; expect module-not-found.
- [ ] **Step 3: Implement** as pure functions, no React.
- [ ] **Step 4: Run**; expect pass. **Step 5: Commit** `feat(web): selection helpers`.

### Task 3: Context routes

**Files:**

- Modify: `apps/web/src/app/routes.ts`
- Create: `apps/web/src/app/routes.test.ts`

**Interfaces:**

- Produces:

  ```ts
  export type Location =
    | { readonly route: WorkspaceRoute }
    | { readonly route: "project"; readonly id: string }
    | { readonly route: "tag"; readonly id: string }
  export const locationFromPath = (path: string): Location
  export const pathForLocation = (location: Location): string  // "/today", "/projects/<id>", "/tags/<id>"
  export const routeOf = (location: Location): WorkspaceRoute  // "tasks" for project/tag
  ```

  `workspaceRoutes`, `routeFromPath`, `routeGroups`, `tasksSection*` unchanged.

- [ ] **Step 1: Tests**: round trip for all twelve routes; `/projects/abc` → `{route:"project", id:"abc"}`; `/tags/x/extra` → id `x`; `/projects/` → `{route:"tasks"}`; `/nothing` → today; `routeOf` of a project location is `"tasks"`.
- [ ] **Step 2: Run** expecting failure. **Step 3: Implement.** **Step 4: Run.** **Step 5: Commit** `feat(web): project and tag context routes`.

### Task 4: `TaskActions` and `editTask` in `App`

**Files:**

- Create: `apps/web/src/components/tasks/task-actions.ts`
- Modify: `apps/web/src/app.tsx` (after `recoverTask`, around line 1480)

**Interfaces:**

- Produces: the `TaskActions` interface from the spec, plus `export type TaskPatch = { readonly title?: string; readonly notes?: string; readonly estimateMinutes?: number | null; readonly deadline?: Task["deadline"] }`. In `App`: `const editTask = async (task: Task, patch: TaskPatch): Promise<void>` queueing `localStore.queueTaskPatch(task.id, patch)` with the same busy/error handling as `submitTaskEdit`; `const taskActions: TaskActions` built from `changeTaskStatus`, `editTask`, `handleFocusCommand` (start), `submitTimeBlock`, `removeTimeBlock`, `saveTaskAsTemplate`, `archiveTaskToHistory` (only when online and a client exists), `removeTask`, `taskHierarchyActions.onCreateChildTask`, `taskHierarchyActions.onMoveTask`.

- [ ] **Step 1: Write the interface file.** No test: it is types plus a `const` object assembled in `App`; Task 12's app test covers it.
- [ ] **Step 2: Add `editTask` and `taskActions` to `App`.** Typecheck: `pnpm --filter @suite/web typecheck`.
- [ ] **Step 3: Commit** `feat(web): group task callbacks as TaskActions`.

### Task 5: Dropdown menu and popover primitives

**Files:**

- Create: `apps/web/src/components/ui/dropdown-menu.tsx`, `apps/web/src/components/ui/popover.tsx`

- [ ] **Step 1: Write both** following the `sheet.tsx`/`tooltip.tsx` pattern: import `{ DropdownMenu as DropdownMenuPrimitive }` and `{ Popover as PopoverPrimitive }` from `"radix-ui"`, `data-slot` attributes, `cn`, content classes `bg-popover text-popover-foreground border border-border rounded-md shadow-[var(--shadow-overlay)] p-1 min-w-[10rem] z-50` and the tw-animate enter/exit classes used by `dialog.tsx`. Export `DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel` and `Popover, PopoverTrigger, PopoverContent, PopoverClose`. Item classes: `flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-1 data-[disabled]:opacity-50`.
- [ ] **Step 2: Typecheck. Commit** `feat(web): dropdown menu and popover primitives`.

### Task 6: Shell components

**Files:**

- Create: `apps/web/src/components/shell/WorkspaceShell.tsx`, `Sidebar.tsx`, `Header.tsx`, `FocusStrip.tsx`, `SyncIndicator.tsx`
- Create tests: `Sidebar.test.tsx`, `Header.test.tsx`
- Delete: `AppShell.tsx`, `SidebarNav.tsx`, `SidebarNav.test.tsx`, `TopBar.tsx` (in Task 12 when `App` switches)
- Modify: `apps/web/src/focus-panel.tsx` (export `terminal`, `TimerDisplay` props type stays internal)

**Interfaces:**

- Produces:

  ```ts
  // Sidebar
  export interface SidebarCounts { readonly today: number; readonly inbox: number; readonly byProject: ReadonlyMap<string, number>; readonly byTag: ReadonlyMap<string, number> }
  export const sidebarCounts = (tasks: readonly Task[], today: string, timeZone: string): SidebarCounts
  interface SidebarProps { location: Location; projects: readonly Project[]; tags: readonly Tag[]; counts: SidebarCounts; collapsed: boolean; onToggleCollapsed(): void; offline: boolean; onNavigate(location: Location): void }
  // Header
  interface HeaderProps { title: ReactNode; focus: FocusStripProps; sync: SyncIndicatorProps; conflictCount: number; commandTrigger: ReactNode; ownerName: string; onSignOut(): void; formError: string | null }
  // FocusStrip
  interface FocusStripProps { session: ActiveSession | null; taskTitle: string | null; clientId: string | null; busy: boolean; online: boolean; timer: FocusPanelTimerProps | undefined; onCommand(command: FocusPanelCommand): void }
  // SyncIndicator
  interface SyncIndicatorProps { syncStatus: "online"|"offline"|"syncing"|undefined; liveStatus: LiveSyncStatus | undefined; baikalConnected: boolean }
  export const syncTone = (p: SyncIndicatorProps): "success" | "warning" | "danger" | "neutral"
  // WorkspaceShell
  interface WorkspaceShellProps { sidebar: SidebarProps; header: HeaderProps; detail: ReactNode | null; children: ReactNode }
  ```

  Counts: `today` = open, undeleted tasks whose `plannedDay === today` or whose `plannedStart` falls on `today` in `timeZone` (use `zonedCalendarDate` from `@suite/domain`); `inbox` = open, undeleted, `plannedStart == null && plannedDay == null`.
  `syncTone`: red when `liveStatus` is an error state or `syncStatus === "offline"` with conflicts handled outside; orange for `syncing`, `liveStatus` reconnecting, or Baikal disconnected; green when all three fine; neutral when `syncStatus` undefined.

- [ ] **Step 1: Sidebar tests**: markup contains `href="/projects/<id>"` with the swatch style `background-color: #...` for a coloured project, a count span `data-count="2"` for a project with two open tasks, `aria-current="page"` on the project link for a project location and on nothing for an unknown id, `data-collapsed="true"` on `aside` when collapsed, the Records group closed, `sidebarCounts` unit cases for today/inbox.
- [ ] **Step 2: Header tests**: `FocusStrip` renders "No session" when null; a running session renders the title, a `<time>` and "Pause"; paused renders "Resume"; break renders "End break"; a follower (other clientId) renders "Take over". `syncTone` table test. Header renders the `destructive` badge with the conflict count when > 0 and no badge when 0.
- [ ] **Step 3: Run** expecting module-not-found.
- [ ] **Step 4: Implement.** `FocusStrip` reuses `formatCountdown`/`localCountdown` from `focus-timer.ts`; copy the command wiring from `FocusPanel` (pause/resume/start_break/end_break/complete/takeover with `expectedRevision: session.revision`). `Sidebar` keeps the `tadooer.sidebar-group:<id>` storage and adds `tadooer.sidebar:collapsed` (read in `App`, since it is layout state). Rail mode renders icon-only links with `title` attributes. Projects group: `projects.filter(p => p.archivedAt === null && !p.hiddenFromMenu).toSorted((a,b) => a.position - b.position)`. Sync popover uses `Popover` from Task 5 with the three status lines; account menu uses `DropdownMenu`.
- [ ] **Step 5: Run tests; typecheck. Commit** `feat(web): workspace shell, sidebar, header and focus strip`.

### Task 7: `TaskRow`

**Files:**

- Create: `apps/web/src/components/tasks/TaskRow.tsx`, `task-row-state.ts`, `TaskRow.test.tsx`, `task-row-state.test.ts`

**Interfaces:**

- Produces:

  ```ts
  // task-row-state.ts: pure
  export type TitleEdit = { readonly editing: false } | { readonly editing: true; readonly draft: string; readonly original: string }
  export const beginEdit = (title: string): TitleEdit
  export const changeDraft = (e: TitleEdit, draft: string): TitleEdit
  export const commitEdit = (e: TitleEdit): { readonly next: TitleEdit; readonly save: string | null } // null when unchanged or blank
  export const cancelEdit = (): TitleEdit
  export const rowMeta = (task: Task, state: TaskListItemState, at: string, timeZone: string, today: string): readonly { kind: "time"|"overdue"|"today"|"estimate"|"deadline"; text: string; tone?: "warning" }[]
  export const describeDeadline = (deadline: NonNullable<Task["deadline"]>, today: string): string // "due Fri" within 7 days else "due 12 Nov"
  // TaskRow.tsx
  export type TaskListItemState = "overdue"|"scheduled"|"planned-day"|"planning"|"completed"  // moved from TaskListItem
  interface TaskRowProps {
    task: Task; state: TaskListItemState; at: string; timeZone: string; today: string;
    project: Project | undefined; tags: readonly Tag[];
    selected: boolean; editing: boolean; focusState: "idle"|"running"|"blocked";
    busy: boolean; calendarActionsAvailable: boolean; focusActionsAvailable: boolean; calendars: BaikalStatusResponse["calendars"];
    actions: TaskActions; moveControls?: {...} | undefined;
    children?: ReactNode; childCount?: number;
    onSelect(task: Task, modifiers: { shift: boolean; toggle: boolean }): void;
    onBeginEdit(task: Task): void; onEndEdit(): void;
  }
  ```

  Markup contract: `<li data-task-id role="option" aria-selected tabIndex={selected ? 0 : -1} class="task-row [task-row--selected] [task-row--completed] [task-row--child]">`; the complete toggle has `aria-label="Complete “<title>”"` / `Reopen`; the menu trigger `aria-label="More actions for “<title>”"`; the play button `aria-label="Start focus on “<title>”"`; running renders `<Badge variant="now">Running</Badge>`; chips render `<span class="task-chip" data-kind="project|tag">`; the "+n" chip has `data-kind="more"`.

- [ ] **Step 1: State tests**: `commitEdit` returns `save: null` for unchanged or whitespace drafts and the trimmed title otherwise; `cancelEdit` is non-editing; `rowMeta` for overdue has tone warning and text "Overdue"; `describeDeadline` for today+2 gives a weekday, for today+10 gives "due 13 Nov" (fixed dates in the test); estimate renders "45m" and "1h30m".
- [ ] **Step 2: Row markup tests**: selected row has `aria-selected="true"` and the class; completed row has line-through class and no play button; `focusState: "running"` renders the Running badge; child row (`task.parentId` set) has `task-row--child`; three tags with four assigned renders `data-kind="more"` containing "+1"; menu is present with Archive only when `actions.archive` is defined and the task is top-level.
- [ ] **Step 3: Run** expecting failure. **Step 4: Implement.** Row body click calls `onSelect` unless the event target is inside a `button, a, input, [role=menuitem], form`. In editing mode render `<Input autoFocus>` with `onKeyDown` Enter → commit and `actions.editTask(task, { title })`, Escape → `onEndEdit`, `onBlur` → commit. Schedule opens a `Popover` containing `TimeBlockForm`. The "⋯" menu uses `DropdownMenu`.
- [ ] **Step 5: Run; typecheck. Commit** `feat(web): TaskRow with selection, inline edit and action menu`.

### Task 8: `AddTaskBar`

**Files:**

- Create: `apps/web/src/components/tasks/AddTaskBar.tsx`, `AddTaskBar.test.tsx`
- Modify: `apps/web/src/components/settings/ApplicationPreferencesSettings.tsx` (add `CaptureLinkPreference` under the capture section; it needs `csrfToken`, which `SettingsPage` already has)

**Interfaces:**

- Produces: `interface AddTaskBarProps { busy: boolean; online: boolean; csrfToken: string | undefined; onSubmit(event): Promise<void>; onTasksCreated?: () => void; inputRef?: Ref<HTMLInputElement> }`; `export const readMarkersPreference = (): boolean` (default true; `tadooer.capture:markers`); the form keeps `name="title"`, `notes`, `estimateMinutes`, `createTags`, and a hidden `<input name="structured" value="on">` rendered only when online and markers are on; the root is `<form class="add-task-bar" aria-label="Add a task">`; the input has `placeholder="Add a task. Try +Project #tag 30m @tomorrow 09:00"`; a `data-markers="on|off|offline"` attribute on the form.

- [ ] **Step 1: Tests**: online + default renders `name="structured"` and `data-markers="on"`; offline renders no `structured` input, `data-markers="offline"` and the text "Offline: plain capture"; the More line contains the Notes field and "Paste a list" only when `csrfToken` is given.
- [ ] **Step 2: Run; Step 3: Implement** with `useState` for `more` and `markers` (initial from `readMarkersPreference`, written on toggle). After `await onSubmit(event)` resolves without throwing, call `form.reset()` and refocus the input. The paste dialog wraps `CapturePasteSection` in `Dialog`.
- [ ] **Step 4: Run; typecheck. Commit** `feat(web): AddTaskBar with markers on by default online`.

### Task 9: `TaskDetailPanel`

**Files:**

- Create: `apps/web/src/components/shell/TaskDetailPanel.tsx`, `TaskDetailPanel.test.tsx`

**Interfaces:**

- Consumes: `TaskActions`, `TaskPlanningForm`, `TimeBlockForm`, `TaskPlacementControls`, `TaskChildrenSection`, `TaskLinksPanel`, `TaskRecurrencePanel`, `NoteMarkdown`, `DeadlineFields`.
- Produces:

  ```ts
  interface TaskDetailPanelProps {
    task: Task;
    tasks: readonly Task[];
    projects: readonly Project[];
    tags: readonly Tag[];
    subtasks: readonly Subtask[];
    provenance: string | undefined;
    calendars: BaikalStatusResponse["calendars"];
    timeZone: string;
    today: string;
    busy: boolean;
    online: boolean;
    csrfToken: string | undefined;
    calendarActionsAvailable: boolean;
    focusState: "idle" | "running" | "blocked";
    focusActionsAvailable: boolean;
    actions: TaskActions;
    onSubmitTaskEdit(event, task): Promise<void>;
    onSubmitTaskOrganization(event, task): Promise<void>;
    onSubmitTaskPlanning?(task, patch: TaskPatchRequest): Promise<void>;
    onSubmitSubtask(event, task): Promise<void>;
    onChangeSubtask(subtask, action): Promise<void>;
    onClose(): void;
  }
  ```

  Root: `<aside class="task-detail" aria-label="Task details">`; close button `aria-label="Close task details"`; section headings "Plan", "Organize", "Notes", "Child tasks", "Checklist", "Links", "Recurrence"; the notes section has an "Edit notes" toggle revealing a `Textarea name="notes"` and Save calling `actions.editTask(task, { notes })`.

- [ ] **Step 1: Tests**: with `csrfToken` the markup contains all seven headings; without it, Links and Recurrence are absent and "Plan" is present; the footer has "Save as template", "Delete", and "Archive" only when `actions.archive` exists; provenance text appears when given.
- [ ] **Step 2: Run; Step 3: Implement** by moving the editor JSX from `TasksPage.renderTask` (lines ~262–470) into the panel, section by section, unchanged apart from headings. **Step 4: Run; typecheck. Commit** `feat(web): task detail panel`.

### Task 10: Lists on the new row: Today, Inbox, Tasks

**Files:**

- Modify: `apps/web/src/today-queue.tsx`, `pages/TodayPage.tsx`, `pages/InboxPage.tsx`, `pages/TasksPage.tsx`
- Modify tests: `today-queue.test.tsx`, `pages/*.test.tsx` as they exist
- Delete: `components/tasks/TaskListItem.tsx`, `components/tasks/TaskCaptureForm.tsx` and their tests

**Interfaces:**

- Consumes: `TaskRow`, `AddTaskBar`, `TaskActions`, `Selection`.
- Produces: a shared prop bundle `interface ListSelectionProps { selection: Selection; editingId: string | null; onSelect(task, modifiers): void; onBeginEdit(task): void; onEndEdit(): void; onVisibleOrderChange(ids: readonly string[]): void }` exported from `components/tasks/TaskRow.tsx`. Page props: `TodayPageProps` loses `onSubmitTask/onChangeTaskStatus/onSubmitTimeBlock/onRemoveTimeBlock/onSubmitTaskEdit/onCreateChildTask` and gains `actions: TaskActions`, `projects`, `tags`, `today`, `list: ListSelectionProps`, `online`; `InboxPageProps` likewise; `TasksPageProps` loses the row-editor props that moved to the panel (`onSubmitTaskOrganization`, `onSubmitSubtask`, `onChangeSubtask`, `subtasks`, `provenance`, `onSaveTaskAsTemplate`, `onRemoveTask`, `onArchiveTask`, `editorsOpen`, `onSubmitTaskPlanning`, `onSubmitTimeBlock`, `onRemoveTimeBlock`, `onSubmitTaskEdit`, `onCreateChildTask`, `onMoveTask`) and gains `actions`, `list`, and `context?: { kind: "project"|"tag"; id: string }` which fixes the filter and hides that dropdown; `recovery` and `onRecoverTask` stay.
- `onVisibleOrderChange` is called from a `useEffect` keyed on the joined id string so `App` can run `retain` and arrow navigation.

- [ ] **Step 1: Update tests first**: `today-queue.test.tsx` asserts `class="task-row` rows and the section headings "Overdue", "Scheduled today", "Planned for today", "Planning" as `<h2>` without `Card`; a new `TasksPage.test.tsx` case renders a project context and asserts no `Project` select and the empty-state text "This project no longer exists" for an unknown id.
- [ ] **Step 2: Run; Step 3: Rewrite** `TodayQueue` sections as `<section><h2 class="list-heading">` with `<ul role="listbox" aria-label>`; `TodayPage` drops `PageHeader`, the sync line, `TaskCaptureForm` and `FocusPanel`, keeps daily note, pinned notes, Plan tomorrow and Week plan below the list; `InboxPage` drops `PageHeader`; `TasksPage` keeps filters, saved views, sections, recovery and Organize, replaces `renderTask` with `TaskRow`, and under `context` hides the matching dropdown and prepends "Boards for this project" for a project context.
- [ ] **Step 4: Run the web suite; typecheck. Commit** `feat(web): Today, Inbox and Tasks on TaskRow and AddTaskBar`.

### Task 11: Bulk bar

**Files:**

- Create: `apps/web/src/components/tasks/BulkBar.tsx`, `bulk-actions.ts`, `bulk-actions.test.ts`

**Interfaces:**

- Produces: `export const runBulk = async (tasks: readonly Task[], run: (task: Task) => Promise<boolean | void>): Promise<{ readonly done: number; readonly failed: Task | null; readonly message: string | null }>` stopping at the first `false` or throw, message `"Changed 2 of 3. “<title>” did not change: <error message>."` or null when all done; `interface BulkBarProps { count: number; projects: readonly Project[]; busy: boolean; online: boolean; onComplete(): void; onArchive(): void; onDelete(): void; onMoveToProject(projectId: string | null): void; onClear(): void }` with root `<div class="bulk-bar" role="toolbar" aria-label="Selected tasks">`.

- [ ] **Step 1: Tests**: `runBulk` with the second of three rejecting returns `done: 1`, `failed` the second task, and the message above; all succeeding returns `message: null`. BulkBar markup shows "3 selected" and disables Archive offline.
- [ ] **Step 2: Run; Step 3: Implement.** **Step 4: Run. Commit** `feat(web): bulk bar for multi-selected tasks`.

### Task 12: Wire `App`

**Files:**

- Modify: `apps/web/src/app.tsx`, `apps/web/src/app.test.tsx`, `components/command-bar/CommandBar.tsx`
- Delete: `components/shell/AppShell.tsx`, `SidebarNav.tsx`, `SidebarNav.test.tsx`, `TopBar.tsx`

- [ ] **Step 1: App tests**: add a case rendering `initialPath="/projects/<id>"` for a project in state and asserting the header shows the project title with no `Project` select; a case with `initialPath="/tasks?task=<id>"` asserting `aria-label="Task details"` is present; keep existing cases passing (update the strings they assert if the capture card copy moved).
- [ ] **Step 2: Run** expecting failures. **Step 3: Implement**:
  - replace `route` state with `location` (`locationFromPath`), derive `route = routeOf(location)`; `navigate(target: Location | WorkspaceRoute)` pushes `pathForLocation`; popstate parses the location.
  - `selection` state, `editingId`, `visibleOrder`; handlers `selectTask(task, mods)`, `clearSelection`; `retain` on every `visibleOrder` change; `/tasks?task=<id>` also calls `selectSingle`.
  - keyboard switch: add the eight actions; `task.add` focuses the add bar ref on list routes; `task.toggle_done`, `focus.toggle`, `task.delete`, `task.schedule`, `task.add_child`, `task.open_details`, `task.edit_title` act on `primaryId`; `selection.clear` clears and closes the panel.
  - replace `<AppShell>` with `<WorkspaceShell>`; compute `sidebarCounts`; `detail` is `TaskDetailPanel` for `primaryId` (not on phones; use a `Sheet` under 64rem through a `matchMedia` state), `BulkBar` replaces the add bar when `selection.ids.length > 1`.
  - the command bar gets `projects` and `tags` props and renders Projects and Tags groups navigating to context locations.
  - the offline render path keeps its own simple nav (unchanged).
- [ ] **Step 4: Run the web suite; typecheck; lint.** **Step 5: Commit** `feat(web): switch App to the workspace shell with selection and context routes`.

### Task 13: Styles

**Files:**

- Modify: `apps/web/src/styles.css` (new section 20, rewritten 64rem block, removed `.topbar*`, `.sidebar-status`, `.today-task-*`, `.task-heading`, `.task-edit`, `.task--child` rules after a grep shows no consumer)

- [ ] **Step 1: Write the rules** for `.workspace` (grid `15rem minmax(0,1fr) auto`; `[data-collapsed="true"]` → `3rem`), `.sidebar`, `.sidebar-section`, `.sidebar-count`, `.sidebar-swatch`, `.header`, `.focus-strip` (`--pink` underline when running), `.sync-dot`, `.main`, `.list-heading` (`--text-2xs` uppercase eyebrow style), `.task-list`, `.task-row` (2.25rem, states, `--primary-tint` + 2px `--purple` left bar when selected, hover actions via `.task-row__actions { opacity: 0 } .task-row:hover/:focus-within/[aria-selected=true] .task-row__actions { opacity: 1 }`), `.task-chip`, `.add-task-bar` (sticky top 0, `--base`), `.bulk-bar`, `.task-detail` (22rem, `--surface-0`, left `--line`, `overflow-y: auto`, `max-height: calc(100dvh - 2.75rem)`, sticky). 64rem block: single column, sidebar row as today, detail hidden (the Sheet renders it). Keep `env(safe-area-inset-*)` on `.sidebar`, `.header`, `.task-detail`.
- [ ] **Step 2: Run** `pnpm vitest run apps/web/src/phone-layout.test.ts` and `pnpm format:check`. **Step 3: Commit** `feat(web): workspace shell styles`.

### Task 14: Verification, screenshots and docs

**Files:**

- Modify: `docs/design/README.md` (component rules: frame, sidebar, row, add bar, detail panel, keyboard; remove the capture card and `TaskListItem` references), `docs/design/information-architecture.md` (one paragraph: context routes), `docs/design/screenshots/` (today-desktop, project-desktop, today-phone replaced)

- [ ] **Step 1: Run** `pnpm --filter @suite/web typecheck && pnpm lint && pnpm format:check && pnpm vitest run apps/web/src packages/contracts/src && pnpm --filter @suite/web build`; expect all pass.
- [ ] **Step 2: Preview** with `t3-dev --profile productivity-suite start` (see `~/.local/share/t3-dev-environments/AGENT-GUIDE.md`), sign in on the fixture, capture the three screenshots at 1280 px and 390 px.
- [ ] **Step 3: Update the docs. Commit** `docs: describe the workspace shell, task row and add bar`.
- [ ] **Step 4: Push and open the pull request** against `main` referencing #194 with the checks and screenshots listed.
