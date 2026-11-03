import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Project, Tag, Task } from "@suite/contracts";
import type { TaskActions } from "./task-actions.ts";
import { TaskRow, type TaskRowProps } from "./TaskRow.tsx";

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "t1",
  title: "Write the brief",
  notes: "",
  status: "open",
  revision: 1,
  createdAt: "2026-11-03T12:00:00.000Z",
  updatedAt: "2026-11-03T12:00:00.000Z",
  completedAt: null,
  deletedAt: null,
  plannedStart: null,
  estimateMinutes: 45,
  ...overrides,
});

const tag = (id: string): Tag => ({
  id,
  ownerId: "owner",
  displayName: id,
  normalizedName: id,
  revision: 1,
  createdAt: "2026-11-03T12:00:00.000Z",
  updatedAt: "2026-11-03T12:00:00.000Z",
  archivedAt: null,
  color: null,
  icon: null,
  position: 0,
});

const project: Project = {
  id: "p1",
  ownerId: "owner",
  title: "Website",
  revision: 1,
  createdAt: "2026-11-03T12:00:00.000Z",
  updatedAt: "2026-11-03T12:00:00.000Z",
  archivedAt: null,
  color: "#3366cc",
  icon: null,
  position: 0,
  hiddenFromMenu: false,
  completedAt: null,
  backlogEnabled: false,
  backlogTaskIds: [],
};

const actions = (extra: Partial<TaskActions> = {}): TaskActions => ({
  changeStatus: () => Promise.resolve(true),
  editTask: () => Promise.resolve(),
  startFocus: () => undefined,
  submitTimeBlock: () => Promise.resolve(),
  removeTimeBlock: () => Promise.resolve(),
  saveAsTemplate: () => Promise.resolve(),
  remove: () => Promise.resolve(),
  createChildTask: () => Promise.resolve(),
  moveTask: () => Promise.resolve(),
  ...extra,
});

const render = (overrides: Partial<TaskRowProps> = {}) =>
  renderToStaticMarkup(
    <ul>
      <TaskRow
        task={task()}
        state="planning"
        at="2026-11-03T12:00:00.000Z"
        timeZone="America/Chicago"
        today="2026-11-03"
        project={undefined}
        tags={[]}
        selected={false}
        editing={false}
        focusState="idle"
        busy={false}
        calendarActionsAvailable={true}
        focusActionsAvailable={true}
        calendars={[]}
        actions={actions()}
        onSelect={() => undefined}
        onBeginEdit={() => undefined}
        onEndEdit={() => undefined}
        {...overrides}
      />
    </ul>,
  );

describe("TaskRow (issue #194)", () => {
  it("renders the toggle, title, metadata and hover actions", () => {
    const html = render();
    expect(html).toContain('data-task-id="t1"');
    expect(html).toContain('role="option"');
    expect(html).toContain('aria-selected="false"');
    expect(html).toContain('aria-label="Complete “Write the brief”"');
    expect(html).toContain('class="task-row__title">Write the brief<');
    expect(html).toContain('data-kind="estimate">45m<');
    expect(html).toContain('aria-label="Start focus on “Write the brief”"');
    expect(html).toContain('aria-label="Schedule “Write the brief”"');
    expect(html).toContain('aria-label="More actions for “Write the brief”"');
  });

  it("marks selection and makes the selected row the tab stop", () => {
    const html = render({ selected: true });
    expect(html).toContain("task-row--selected");
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('tabindex="0"');
    expect(render()).toContain('tabindex="-1"');
  });

  it("renders an input while editing", () => {
    const html = render({ editing: true });
    expect(html).toContain("task-row--editing");
    expect(html).toContain('aria-label="Title of “Write the brief”"');
    expect(html).toContain('value="Write the brief"');
  });

  it("strikes a completed row and drops focus and schedule", () => {
    const html = render({
      task: task({ status: "completed" }),
      state: "completed",
    });
    expect(html).toContain("task-row--completed");
    expect(html).toContain('aria-label="Reopen “Write the brief”"');
    expect(html).not.toContain("Start focus on");
    expect(html).not.toContain("Schedule “");
  });

  it("shows the running badge and blocks focus while another task runs", () => {
    expect(render({ focusState: "running" })).toContain(">Running<");
    const blocked = render({ focusState: "blocked" });
    expect(blocked).toContain("Another task has the focus session.");
    expect(blocked).toMatch(/disabled=""[^>]*aria-label="Start focus on/);
  });

  it("says why focus is unavailable offline", () => {
    expect(render({ focusActionsAvailable: false })).toContain(
      "Reconnect to start focus.",
    );
  });

  it("shows the project chip and at most three tags", () => {
    const html = render({
      project,
      tags: [tag("a"), tag("b"), tag("c"), tag("d")],
    });
    expect(html).toContain('data-kind="project"');
    expect(html).toContain("background-color:#3366cc");
    expect(html).toContain(">Website<");
    expect(html.split('data-kind="tag"')).toHaveLength(4);
    expect(html).toMatch(/data-kind="more"[^>]*>\+1</);
  });

  it("indents a child row and shows the overdue tone", () => {
    const html = render({
      task: task({ parentId: "parent", plannedDay: "2026-11-01" }),
      state: "overdue",
    });
    expect(html).toContain("task-row--child");
    expect(html).toContain('data-tone="warning"');
    expect(html).toContain("Overdue · planned for 2026-11-01");
  });

  it("nests children behind a chevron", () => {
    const html = render({
      childCount: 2,
      children: <li className="task-row task-row--child">child</li>,
    });
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("Hide 2 child tasks of “Write the brief”");
    expect(html).toContain("task-row__children");
  });
});
