import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Task } from "@suite/contracts";
import type { TaskActions } from "../tasks/task-actions.ts";
import {
  TaskDetailPanel,
  type TaskDetailPanelProps,
} from "./TaskDetailPanel.tsx";

const task: Task = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Write the brief",
  notes: "Two **bold** words",
  status: "open",
  revision: 4,
  createdAt: "2026-11-03T12:00:00.000Z",
  updatedAt: "2026-11-03T12:00:00.000Z",
  completedAt: null,
  deletedAt: null,
  plannedStart: null,
  estimateMinutes: 45,
  parentId: null,
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

const render = (overrides: Partial<TaskDetailPanelProps> = {}) =>
  renderToStaticMarkup(
    <TaskDetailPanel
      task={task}
      tasks={[task]}
      projects={[]}
      tags={[]}
      subtasks={[]}
      provenance={undefined}
      calendars={[]}
      timeZone="America/Chicago"
      today="2026-11-03"
      busy={false}
      online={true}
      csrfToken={undefined}
      calendarActionsAvailable={true}
      focusState="idle"
      focusActionsAvailable={true}
      actions={actions()}
      onSubmitTaskEdit={() => Promise.resolve()}
      onSubmitTaskOrganization={() => Promise.resolve()}
      onSubmitTaskPlanning={() => Promise.resolve()}
      onSubmitSubtask={() => Promise.resolve()}
      onChangeSubtask={() => Promise.resolve()}
      onClose={() => undefined}
      {...overrides}
    />,
  );

describe("TaskDetailPanel (issue #194)", () => {
  it("shows every section with a session token", () => {
    const html = render({ csrfToken: "token" });
    expect(html).toContain('aria-label="Task details"');
    expect(html).toContain("Close task details");
    for (const heading of [
      "Plan",
      "Organize",
      "Notes",
      "Child tasks",
      "Checklist",
      "Links",
      "Recurrence",
    ])
      expect(html).toContain(`>${heading}</h2>`);
    expect(html).toContain("Two <strong>bold</strong> words");
    expect(html).toContain("Revision 4");
  });

  it("leaves out the online-only sections without a token", () => {
    const html = render();
    expect(html).toContain(">Plan</h2>");
    expect(html).not.toContain(">Links</h2>");
    expect(html).not.toContain(">Recurrence</h2>");
  });

  it("offers Archive only when the action exists and the task is top-level", () => {
    expect(render()).not.toContain(">Archive<");
    const archive = actions({ archive: () => Promise.resolve() });
    expect(render({ actions: archive })).toContain(">Archive<");
    expect(
      render({ actions: archive, task: { ...task, parentId: "parent" } }),
    ).not.toContain(">Archive<");
    expect(render({ actions: archive, online: false })).toMatch(
      /disabled=""[^>]*title="Move this task and its children to History"/,
    );
  });

  it("notes template provenance and the running focus", () => {
    expect(render({ provenance: "template" })).toContain(
      "Created from a reusable template.",
    );
    expect(render({ focusState: "running" })).toContain("Focus running");
  });
});
