import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Task } from "@suite/contracts";
import { listContext } from "./components/tasks/test-support.ts";
import { TodayQueue } from "./today-queue.tsx";

const task = (
  id: string,
  title: string,
  plannedStart: string | null,
): Task => ({
  id,
  title,
  notes: "",
  status: "open",
  revision: 1,
  createdAt: "2026-08-10T12:00:00.000Z",
  updatedAt: "2026-08-10T12:00:00.000Z",
  completedAt: null,
  deletedAt: null,
  plannedStart,
  estimateMinutes: 30,
  projectId: null,
  tagIds: [],
});
const preferences = {
  workingDays: [1, 2, 3, 4, 5],
  workdayStart: "09:00",
  workdayEnd: "17:00",
  breakStart: "12:00",
  breakEnd: "12:30",
  timeZone: "America/Chicago",
};
const render = (withPreferences = true) =>
  renderToStaticMarkup(
    <TodayQueue
      at="2026-08-10T15:00:00.000Z"
      preferences={withPreferences ? preferences : undefined}
      tasks={[
        task("overdue", "Quarterly report", "2026-08-10T14:00:00.000Z"),
        task("today", "Today task", "2026-08-10T16:00:00.000Z"),
        task("future", "Future task title", "2026-08-11T05:00:00.000Z"),
        task("inbox", "Inbox note", null),
      ]}
      context={listContext()}
      onViewTasks={() => undefined}
    />,
  );

describe("TodayQueue", () => {
  it("renders accessible queue hierarchy while hiding future work", () => {
    const markup = render();
    expect(markup).toContain('id="today-overdue-title"');
    expect(markup).toContain('id="today-scheduled-title"');
    expect(markup).toContain('id="today-planning-title"');
    expect(markup).toContain("1 future task hidden");
    expect(markup).not.toContain("Future task title");
    expect(markup).toContain('aria-label="Complete “Quarterly report”"');
    expect(markup).toContain('aria-label="Start focus on “Quarterly report”"');
    expect(markup).toContain('aria-label="Complete “Inbox note”"');
    expect(markup).toContain("Reconnect to start focus.");
  });

  it("hides scheduled titles without cached preferences", () => {
    const markup = render(false);
    expect(markup).toContain(
      "3 scheduled tasks hidden until the planning time zone is available.",
    );
    expect(markup).not.toContain("Today task");
    expect(markup).not.toContain("Future task title");
  });

  it("omits sections with nothing in them (issue #175)", () => {
    const markup = renderToStaticMarkup(
      <TodayQueue
        at="2026-08-10T15:00:00.000Z"
        preferences={preferences}
        tasks={[task("inbox", "Inbox note", null)]}
        context={listContext()}
        onViewTasks={() => undefined}
      />,
    );
    expect(markup).toContain('id="today-planning-title"');
    expect(markup).not.toContain('id="today-overdue-title"');
    expect(markup).not.toContain('id="today-scheduled-title"');
    expect(markup).not.toContain("Today is clear.");
  });

  it("renders the empty queue state", () => {
    const markup = renderToStaticMarkup(
      <TodayQueue
        at="2026-08-10T15:00:00.000Z"
        preferences={preferences}
        tasks={[]}
        context={listContext()}
        onViewTasks={() => undefined}
      />,
    );
    expect(markup).toContain("Today is clear.");
  });
});

describe("TodayQueue inline edit and child tasks (issues #170, #194)", () => {
  const parent = task("parent", "Plan trip", null);
  const child: Task = {
    ...task("child", "Book train", null),
    parentId: "parent",
    childPosition: 1024,
  };
  const renderWith = (tasks: readonly Task[], context = listContext()) =>
    renderToStaticMarkup(
      <TodayQueue
        at="2026-08-10T15:00:00.000Z"
        preferences={preferences}
        tasks={tasks}
        context={context}
        onViewTasks={() => undefined}
      />,
    );

  it("nests a child under its listed parent instead of listing it twice", () => {
    const markup = renderWith([parent, child]);
    expect(markup).toContain('aria-label="Child tasks of “Plan trip”"');
    expect(markup).toContain("Hide 1 child task of “Plan trip”");
    expect(markup).toContain('aria-label="Complete “Book train”"');
    expect(markup.split('data-task-id="child"')).toHaveLength(2);
  });

  it("edits the title in place for the row the list names", () => {
    expect(renderWith([parent, child])).not.toContain("task-row--editing");
    const markup = renderWith(
      [parent, child],
      listContext({
        list: {
          selectedIds: ["parent"],
          editingId: "parent",
          onSelect: () => undefined,
          onBeginEdit: () => undefined,
          onEndEdit: () => undefined,
          onVisibleOrderChange: () => undefined,
        },
      }),
    );
    expect(markup).toContain("task-row--editing");
    expect(markup).toContain('aria-label="Title of “Plan trip”"');
    expect(markup).toContain('value="Plan trip"');
    expect(markup).toContain("task-row--selected");
  });

  it("lists a child as its own row when its parent is not in the queue", () => {
    const markup = renderWith([{ ...parent, status: "completed" }, child]);
    expect(markup).toContain('aria-label="Start focus on “Book train”"');
    expect(markup).not.toContain("Child tasks of");
  });
});
