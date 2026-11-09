import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Project, Tag, Task } from "@suite/contracts";
import { Sidebar, sidebarCounts, type SidebarCounts } from "./Sidebar.tsx";

const task = (overrides: Partial<Task> & { id: string }): Task => ({
  title: `Task ${overrides.id}`,
  notes: "",
  status: "open",
  revision: 1,
  createdAt: "2026-11-03T12:00:00.000Z",
  updatedAt: "2026-11-03T12:00:00.000Z",
  completedAt: null,
  deletedAt: null,
  plannedStart: null,
  estimateMinutes: null,
  ...overrides,
});

const project = (overrides: Partial<Project> & { id: string }): Project => ({
  ownerId: "owner",
  title: `Project ${overrides.id}`,
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
  ...overrides,
});

const tag = (overrides: Partial<Tag> & { id: string }): Tag => ({
  ownerId: "owner",
  displayName: `Tag ${overrides.id}`,
  normalizedName: `tag ${overrides.id}`,
  revision: 1,
  createdAt: "2026-11-03T12:00:00.000Z",
  updatedAt: "2026-11-03T12:00:00.000Z",
  archivedAt: null,
  color: null,
  icon: null,
  position: 0,
  ...overrides,
});

const noCounts: SidebarCounts = {
  today: 0,
  inbox: 0,
  byProject: new Map(),
  byTag: new Map(),
};

const render = (props: Partial<Parameters<typeof Sidebar>[0]> = {}): string =>
  renderToStaticMarkup(
    <Sidebar
      location={{ route: "today" }}
      projects={[]}
      tags={[]}
      counts={noCounts}
      collapsed={false}
      onToggleCollapsed={() => undefined}
      offline={false}
      onNavigate={() => undefined}
      {...props}
    />,
  );

describe("sidebarCounts (issue #194)", () => {
  it("counts today's plans, the inbox and each context", () => {
    const counts = sidebarCounts(
      [
        task({ id: "a", plannedDay: "2026-11-03", projectId: "p1" }),
        task({ id: "b", plannedStart: "2026-11-03T15:00:00.000Z" }),
        task({ id: "c", plannedStart: "2026-11-04T03:00:00.000Z" }),
        task({ id: "d", tagIds: ["t1", "t2"], projectId: "p1" }),
        task({ id: "e", status: "completed", projectId: "p1" }),
        task({ id: "f", deletedAt: "2026-11-03T12:00:00.000Z" }),
      ],
      "2026-11-03",
      "America/Chicago",
    );
    // c is 22:00 on the 3rd in Chicago, so it counts for today.
    expect(counts.today).toBe(3);
    // Date-only plans have no time, so a and d wait in the inbox.
    expect(counts.inbox).toBe(2);
    expect(counts.byProject.get("p1")).toBe(2);
    expect(counts.byTag.get("t1")).toBe(1);
    expect(counts.byTag.get("t2")).toBe(1);
  });
});

describe("Sidebar (issue #194)", () => {
  it("lists views, then projects and tags with swatches and counts", () => {
    const html = render({
      projects: [
        project({ id: "p2", title: "Later", position: 2 }),
        project({ id: "p1", title: "Website", color: "#3366cc", position: 1 }),
        project({ id: "p3", title: "Hidden", hiddenFromMenu: true }),
        project({ id: "p4", title: "Old", archivedAt: "2026-10-01T00:00:00Z" }),
      ],
      tags: [tag({ id: "t1", displayName: "errand" })],
      counts: {
        today: 2,
        inbox: 0,
        byProject: new Map([["p1", 2]]),
        byTag: new Map([["t1", 1]]),
      },
    });
    expect(html).toContain('href="/today"');
    expect(html).toContain('href="/projects/p1"');
    expect(html).toContain('href="/tags/t1"');
    expect(html).toContain("background-color:#3366cc");
    expect(html).toContain('data-count="2"');
    expect(html).not.toContain("Hidden");
    expect(html).not.toContain(">Old<");
    expect(html.indexOf("/projects/p1")).toBeLessThan(
      html.indexOf("/projects/p2"),
    );
    expect(html.indexOf('href="/habits"')).toBeLessThan(
      html.indexOf("/projects/p1"),
    );
    expect(html).toContain(">Projects<");
    expect(html).toContain(">Tags<");
    expect(html).toContain(">Records<");
    expect(html).toContain(">Setup<");
    expect(html).toContain("New project");
  });

  it("marks the current context and nothing for an unknown id", () => {
    const projects = [project({ id: "p1", title: "Website" })];
    const current = render({
      location: { route: "project", id: "p1" },
      projects,
    });
    expect(current).toMatch(/href="\/projects\/p1"[^>]*aria-current="page"/);
    expect(current).not.toMatch(/href="\/tasks"[^>]*aria-current="page"/);
    const unknown = render({
      location: { route: "project", id: "gone" },
      projects,
    });
    expect(unknown).not.toContain('aria-current="page"');
  });

  it("keeps Records closed and opens it while one of its views is current", () => {
    expect(render()).toMatch(
      /aria-expanded="false"[^>]*aria-controls="[^"]*sidebar-group-records"/,
    );
    expect(render({ location: { route: "worklog" } })).toMatch(
      /aria-expanded="true"[^>]*aria-controls="[^"]*sidebar-group-records"/,
    );
  });

  it("collapses to a rail with titles and shows the offline note", () => {
    const html = render({ collapsed: true, offline: true });
    expect(html).toContain('data-collapsed="true"');
    expect(html).toContain('title="Inbox"');
    expect(html).toContain("Expand the sidebar");
    expect(html).toContain("Showing tasks saved in this browser.");
  });
});
