import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CalendarEventProjection, Task } from "@suite/contracts";
import { DayOrderList } from "../../day-order.tsx";
import { plannerEntryTask } from "../../pages/PlannerPage.tsx";
import { TaskTitleButton } from "../tasks/TaskTitleButton.tsx";
import { UnplannedTasksDrawer } from "../tasks/UnplannedTasksDrawer.tsx";

// Issue #196: the routes outside Today and Inbox in the workspace frame.

const task = (id: string, title: string, extra: Partial<Task> = {}): Task => ({
  id,
  title,
  notes: "",
  status: "open",
  revision: 1,
  createdAt: "2026-11-03T12:00:00.000Z",
  updatedAt: "2026-11-03T12:00:00.000Z",
  completedAt: null,
  deletedAt: null,
  plannedStart: null,
  estimateMinutes: null,
  projectId: null,
  tagIds: [],
  ...extra,
});

const event = (linkedTaskId?: string): CalendarEventProjection =>
  ({
    summary: "Block",
    ...(linkedTaskId === undefined ? {} : { linkedTaskId }),
  }) as unknown as CalendarEventProjection;

describe("workspace frame on the remaining routes (issue #196)", () => {
  it("leaves the page title to the shell header and cards to view sections", () => {
    for (const page of [
      "PlannerPage",
      "BoardsPage",
      "HabitsPage",
      "HistoryPage",
      "WorklogPage",
      "CountersPage",
      "ReusePage",
      "ConnectionsPage",
      "SettingsPage",
      "TasksPage",
    ]) {
      const source = readFileSync(
        join(import.meta.dirname, "../../pages", `${page}.tsx`),
        "utf8",
      );
      expect(source, page).not.toMatch(/<h1\b|ui\/page-header|ui\/card/);
      expect(source, page).toContain("<ViewIntro");
    }
  });

  it("opens task entries and linked blocks in the panel, plain events in the sheet", () => {
    const brief = task("a", "Write the brief");
    const tasks = [brief];
    expect(plannerEntryTask({ kind: "task", task: brief }, tasks)).toBe(brief);
    expect(plannerEntryTask({ kind: "event", event: event("a") }, tasks)).toBe(
      brief,
    );
    expect(
      plannerEntryTask({ kind: "event", event: event("missing") }, tasks),
    ).toBeUndefined();
    expect(
      plannerEntryTask({ kind: "event", event: event() }, tasks),
    ).toBeUndefined();
  });

  it("renders a task title as a button only when it can open the task", () => {
    const brief = task("a", "Write the brief");
    const open = renderToStaticMarkup(
      <TaskTitleButton task={brief} onSelect={() => undefined}>
        <strong>Write the brief</strong>
      </TaskTitleButton>,
    );
    expect(open).toContain(
      '<button type="button" class="task-title-button" aria-label="Open details for “Write the brief”">',
    );
    const plain = renderToStaticMarkup(
      <TaskTitleButton task={brief} onSelect={undefined}>
        <strong>Write the brief</strong>
      </TaskTitleButton>,
    );
    expect(plain).toBe("<strong>Write the brief</strong>");
  });

  it("lets the day order and the unplanned drawer open a task", () => {
    const brief = task("a", "Write the brief");
    const order = renderToStaticMarkup(
      <DayOrderList
        label="Tasks planned for 2026-11-04"
        items={[{ task: brief, movable: true }]}
        available={true}
        busy={false}
        onMove={() => undefined}
        onSelectTask={() => undefined}
      />,
    );
    expect(order).toContain('aria-label="Open details for “Write the brief”"');
    const drawer = renderToStaticMarkup(
      <UnplannedTasksDrawer
        tasks={[brief]}
        targets={[{ id: "2026-11-04", label: "Wed 4" }]}
        targetLabel="Day"
        placeLabel="Plan"
        available={true}
        busy={false}
        onPlace={() => undefined}
        onSelectTask={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(drawer).toContain('aria-label="Open details for “Write the brief”"');
    expect(drawer).toContain('draggable="true"');
  });
});
