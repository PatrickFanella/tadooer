import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TasksPage, type TasksPageProps } from "./TasksPage.tsx";

// Issue #171: the list and Organize are separate sections of the page.
const props: TasksPageProps = {
  tasks: [],
  visibleTasks: [],
  recovery: [],
  projects: [],
  tags: [],
  subtasks: {},
  provenance: {},
  baikalCalendars: [],
  taskQuery: "",
  taskStatusFilter: "all",
  taskProjectFilter: "",
  taskTagFilter: "",
  busy: false,
  calendarActionsAvailable: false,
  onTaskQueryChange: () => undefined,
  onTaskStatusFilterChange: () => undefined,
  onTaskProjectFilterChange: () => undefined,
  onTaskTagFilterChange: () => undefined,
  onSubmitOrganization: () => Promise.resolve(),
  onSubmitTaskEdit: () => Promise.resolve(),
  onSubmitTimeBlock: () => Promise.resolve(),
  onRemoveTimeBlock: () => Promise.resolve(),
  onSubmitTaskOrganization: () => Promise.resolve(),
  onSubmitSubtask: () => Promise.resolve(),
  onChangeSubtask: () => Promise.resolve(),
  onSaveTaskAsTemplate: () => Promise.resolve(),
  onChangeTaskStatus: () => Promise.resolve(true),
  onRemoveTask: () => Promise.resolve(),
  onRecoverTask: () => Promise.resolve(),
  onCreateChildTask: () => Promise.resolve(),
  onMoveTask: () => Promise.resolve(),
  organization: {
    csrfToken: "token",
    online: false,
    onProjectsChange: () => undefined,
    onTagsChange: () => undefined,
  },
};

describe("TasksPage sections (issue #171)", () => {
  it("shows the filters and list by default, with deleted tasks behind a disclosure", () => {
    const html = renderToStaticMarkup(<TasksPage {...props} />);
    expect(html).toContain('aria-label="Filter tasks"');
    expect(html).toContain("Captured tasks");
    expect(html).toContain("<summary>Recently deleted tasks (0)</summary>");
    expect(html).not.toContain("New project");
    expect(html).not.toContain("Sidebar folders");
  });

  it("shows projects, tags, folders and recurring series under Organize", () => {
    const html = renderToStaticMarkup(
      <TasksPage {...props} section="organize" />,
    );
    expect(html).toContain("New project");
    expect(html).toContain("New tag");
    expect(html).toContain("Sidebar folders");
    expect(html).not.toContain('aria-label="Filter tasks"');
    expect(html).not.toContain("Captured tasks");
  });

  it("marks the selected section in the header tabs", () => {
    const html = renderToStaticMarkup(
      <TasksPage {...props} section="organize" />,
    );
    expect(html).toContain('aria-label="Tasks page section"');
    expect(html).toMatch(/data-state="active"[^>]*>Organize</);
  });
});
