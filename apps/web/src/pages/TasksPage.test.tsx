import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { noopActions, noopList } from "../components/tasks/test-support.ts";
import { TasksPage, type TasksPageProps } from "./TasksPage.tsx";

// Issue #171: the list and Organize are separate sections of the page.
const props: TasksPageProps = {
  tasks: [],
  visibleTasks: [],
  recovery: [],
  projects: [],
  tags: [],
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
  onRecoverTask: () => Promise.resolve(),
  actions: noopActions,
  list: noopList,
  onSubmitTask: () => Promise.resolve(),
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

  it("fixes the filter on a context route and names a missing context (issue #194)", () => {
    const project = {
      id: "p1",
      ownerId: "owner",
      title: "Website",
      revision: 1,
      createdAt: "2026-11-03T12:00:00.000Z",
      updatedAt: "2026-11-03T12:00:00.000Z",
      archivedAt: null,
      color: null,
      icon: null,
      position: 0,
      hiddenFromMenu: false,
      completedAt: null,
      backlogEnabled: false,
      backlogTaskIds: [],
    };
    const known = renderToStaticMarkup(
      <TasksPage
        {...props}
        projects={[project]}
        taskProjectFilter="p1"
        context={{ kind: "project", id: "p1" }}
      />,
    );
    expect(known).not.toContain("All projects");
    expect(known).toContain("All tags");
    expect(known).toContain('aria-label="Add a task"');
    expect(known).not.toContain("no longer exists");
    const gone = renderToStaticMarkup(
      <TasksPage
        {...props}
        projects={[project]}
        taskProjectFilter="gone"
        context={{ kind: "project", id: "gone" }}
      />,
    );
    expect(gone).toContain("This project no longer exists.");
    expect(gone).not.toContain('aria-label="Add a task"');
  });

  it("marks the selected section in the header tabs", () => {
    const html = renderToStaticMarkup(
      <TasksPage {...props} section="organize" />,
    );
    expect(html).toContain('aria-label="Tasks page section"');
    expect(html).toMatch(/data-state="active"[^>]*>Organize</);
  });
});
