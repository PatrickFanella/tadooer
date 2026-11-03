import { describe, expect, it } from "vitest";
import {
  locationFromPath,
  pathForLocation,
  routeFromPath,
  routeOf,
  tasksSectionFromPath,
  tasksSectionPath,
  workspaceRoutes,
} from "./routes.ts";

describe("routeFromPath", () => {
  it.each([
    ["/today", "today"],
    ["/tasks", "tasks"],
    ["/history", "history"],
    ["/worklog", "worklog"],
    ["/counters", "counters"],
    ["/unknown", "today"],
  ] as const)("maps %s to %s", (path, expected) => {
    expect(routeFromPath(path)).toBe(expected);
  });
});

describe("tasksSectionFromPath (issue #171)", () => {
  it.each([
    ["/tasks", "list"],
    ["/tasks/organize", "organize"],
    ["/tasks/organize/", "organize"],
    ["/today/organize", "list"],
    ["/tasks?task=abc", "list"],
  ] as const)("maps %s to %s", (path, expected) => {
    expect(tasksSectionFromPath(path.split("?")[0] ?? path)).toBe(expected);
  });

  it("round-trips through tasksSectionPath", () => {
    expect(tasksSectionPath("list")).toBe("/tasks");
    expect(tasksSectionPath("organize")).toBe("/tasks/organize");
    expect(routeFromPath(tasksSectionPath("organize"))).toBe("tasks");
  });
});

describe("workspace locations (issue #194)", () => {
  it("round-trips every view route", () => {
    for (const route of workspaceRoutes) {
      const location = locationFromPath(`/${route}`);
      expect(location).toEqual({ route });
      expect(pathForLocation(location)).toBe(`/${route}`);
      expect(routeOf(location)).toBe(route);
    }
  });

  it("parses project and tag context routes", () => {
    expect(locationFromPath("/projects/abc")).toEqual({
      route: "project",
      id: "abc",
    });
    expect(locationFromPath("/tags/x/extra")).toEqual({
      route: "tag",
      id: "x",
    });
    expect(pathForLocation({ route: "project", id: "abc" })).toBe(
      "/projects/abc",
    );
    expect(pathForLocation({ route: "tag", id: "x" })).toBe("/tags/x");
    expect(routeOf({ route: "project", id: "abc" })).toBe("tasks");
    expect(routeOf({ route: "tag", id: "x" })).toBe("tasks");
  });

  it("falls back like routeFromPath", () => {
    expect(locationFromPath("/projects/")).toEqual({ route: "tasks" });
    expect(locationFromPath("/projects")).toEqual({ route: "tasks" });
    expect(locationFromPath("/nothing")).toEqual({ route: "today" });
    expect(locationFromPath("/tasks/organize")).toEqual({ route: "tasks" });
    expect(locationFromPath("/tags/with%20space")).toEqual({
      route: "tag",
      id: "with space",
    });
  });
});
