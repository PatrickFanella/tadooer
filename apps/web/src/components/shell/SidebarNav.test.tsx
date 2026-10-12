import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { routeGroupOf, routeGroups, workspaceRoutes } from "@/app/routes";
import { SidebarNav } from "./SidebarNav.tsx";

describe("SidebarNav (issue #175)", () => {
  it("every workspace route belongs to exactly one group", () => {
    const grouped = routeGroups.flatMap((group) => group.routes);
    expect([...grouped].sort()).toEqual([...workspaceRoutes].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("lists daily views flat and keeps the other groups collapsed", () => {
    const html = renderToStaticMarkup(
      <SidebarNav route="today" onNavigate={() => undefined} />,
    );
    for (const route of workspaceRoutes)
      expect(html).toContain(`href="/${route}"`);
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('data-open="false"');
    expect(html).not.toContain('data-open="true"');
    expect(html).toContain(">Records<");
    expect(html).toContain(">Setup<");
  });

  it("opens the group that holds the current view", () => {
    expect(routeGroupOf("worklog")).toBe("records");
    const html = renderToStaticMarkup(
      <SidebarNav route="worklog" onNavigate={() => undefined} />,
    );
    expect(html).toMatch(
      /aria-expanded="true"[^>]*aria-controls="sidebar-group-records"/,
    );
    expect(html).toMatch(
      /aria-expanded="false"[^>]*aria-controls="sidebar-group-setup"/,
    );
  });
});
