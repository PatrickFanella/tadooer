import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Task } from "@suite/contracts";
import { UnplannedTasksDrawer, isUnplanned } from "./UnplannedTasksDrawer.tsx";

const task = (id: string, title: string, extra: Partial<Task> = {}): Task => ({
  id,
  title,
  notes: "",
  status: "open",
  revision: 1,
  createdAt: "2026-10-12T12:00:00.000Z",
  updatedAt: "2026-10-12T12:00:00.000Z",
  completedAt: null,
  deletedAt: null,
  plannedStart: null,
  estimateMinutes: 25,
  projectId: null,
  tagIds: [],
  ...extra,
});

describe("UnplannedTasksDrawer (issue #172)", () => {
  const tasks = [
    task("a", "Write the brief"),
    task("b", "Planned already", { plannedDay: "2026-10-13" }),
    task("c", "Timed already", { plannedStart: "2026-10-13T09:00:00.000Z" }),
    task("d", "Finished", { status: "completed" }),
  ];
  const targets = [
    { id: "2026-10-13", label: "Tue 13" },
    { id: "2026-10-14", label: "Wed 14" },
  ];

  it("lists only open tasks without a planned day or time", () => {
    expect(tasks.filter(isUnplanned).map(({ id }) => id)).toEqual(["a"]);
    const html = renderToStaticMarkup(
      <UnplannedTasksDrawer
        tasks={tasks}
        targets={targets}
        targetLabel="Day"
        placeLabel="Plan"
        available={true}
        busy={false}
        onPlace={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(html).toContain("Write the brief");
    expect(html).not.toContain("Planned already");
    expect(html).not.toContain("Timed already");
    expect(html).not.toContain("Finished");
    expect(html).toContain('draggable="true"');
    expect(html).toContain('aria-label="Day for “Write the brief”"');
    expect(html).toContain('value="2026-10-14"');
  });

  it("keeps rows undraggable and the control disabled until the device can write", () => {
    const html = renderToStaticMarkup(
      <UnplannedTasksDrawer
        tasks={tasks}
        targets={targets}
        targetLabel="Day"
        placeLabel="Plan"
        available={false}
        busy={false}
        onPlace={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(html).toContain('draggable="false"');
    expect(html).toContain("needs this device to have synced");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Plan</);
  });
});
