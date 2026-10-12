import { describe, expect, it } from "vitest";
import {
  routeFromPath,
  tasksSectionFromPath,
  tasksSectionPath,
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
